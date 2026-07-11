//! Distance-aware leaf ordering for an already-built hierarchical tree.
//!
//! Agglomerative linkage fixes which leaves belong below every merge, but the
//! left/right orientation of each merge is arbitrary. This module applies the
//! dynamic program from Bar-Joseph, Gifford and Jaakkola, "Fast optimal leaf
//! ordering for hierarchical clustering" (2001): among every ordering allowed
//! by flipping merge children, minimize the sum of distances between adjacent
//! leaves. The final endpoint choice also includes the first/last seam because
//! FontCluster draws the leaves on a ring. The tree topology, merge heights and
//! representatives stay intact.
//!
//! Each merge's endpoint-cost table is filled with the paper's two-phase
//! minimization: for one left outer endpoint, first the best "left path +
//! bridge" cost into every right inner endpoint, then the best completion for
//! every right outer endpoint. Splitting the recurrence this way removes a
//! factor of n and bounds the whole program by the paper's O(n³) worst case,
//! with a data-independent operation count — a per-cell candidate search with
//! branch-and-bound pruning is O(n⁴) whenever the pruning bound goes loose,
//! which real embedding distances (near-uniform in high dimensions) reliably
//! trigger. The inner loops are contiguous slice scans, and table rows are
//! written independently, so large merges fan out across rayon's thread pool
//! without affecting the result. The optimal inner endpoints are re-derived
//! during the backtrack — an O(n²) total argmin — instead of being stored per
//! cell, which drops the largest side table of the forward pass.

use crate::config::DendrogramMerge;
use rayon::prelude::*;

/// Endpoint-table cells (`|left leaves| × |right leaves|`) below which a merge
/// is processed serially; larger merges split their rows across rayon.
const PARALLEL_CELL_THRESHOLD: usize = 4096;

/// Reorients `merges` in place to minimize cyclic adjacent-leaf distance.
///
/// `condensed_distances` is the upper triangle produced by iterating
/// `i = 0..leaf_count`, then `j = i + 1..leaf_count`. The caller builds both
/// inputs together; debug assertions and release-mode early returns protect
/// against a future contract regression.
pub(super) fn optimize_leaf_order(
    merges: &mut [DendrogramMerge],
    condensed_distances: &[f32],
    leaf_count: usize,
) {
    if leaf_count < 2 {
        return;
    }
    if merges.len() != leaf_count - 1
        || condensed_distances.len() != leaf_count * (leaf_count - 1) / 2
    {
        debug_assert!(false, "invalid dendrogram or condensed distance matrix");
        return;
    }

    let node_count = leaf_count + merges.len();
    let root = node_count - 1;
    if merges
        .iter()
        .enumerate()
        .any(|(index, merge)| merge.left >= leaf_count + index || merge.right >= leaf_count + index)
    {
        debug_assert!(false, "dendrogram children are not topologically ordered");
        return;
    }

    // Relabel leaves by the tree's current left-first traversal. Every
    // subtree is then a contiguous integer range, which makes the dynamic
    // program's endpoint sets cheap to enumerate.
    let mut leaf_order = Vec::with_capacity(leaf_count);
    let mut stack = vec![root];
    while let Some(node) = stack.pop() {
        if node < leaf_count {
            leaf_order.push(node);
            continue;
        }
        let merge = &merges[node - leaf_count];
        stack.push(merge.right);
        stack.push(merge.left);
    }
    if leaf_order.len() != leaf_count {
        debug_assert!(false, "dendrogram does not contain every leaf exactly once");
        return;
    }

    let mut original_to_sorted = vec![usize::MAX; leaf_count];
    for (sorted, original) in leaf_order.iter().copied().enumerate() {
        if original >= leaf_count || original_to_sorted[original] != usize::MAX {
            debug_assert!(false, "dendrogram contains an invalid or duplicate leaf");
            return;
        }
        original_to_sorted[original] = sorted;
    }

    let sorted_children = merges
        .iter()
        .map(|merge| {
            [merge.left, merge.right].map(|child| {
                if child < leaf_count {
                    original_to_sorted[child]
                } else {
                    child
                }
            })
        })
        .collect::<Vec<_>>();

    let mut ranges = vec![[0usize; 2]; node_count];
    for (leaf, range) in ranges.iter_mut().take(leaf_count).enumerate() {
        *range = [leaf, leaf + 1];
    }
    for (merge_index, [left, right]) in sorted_children.iter().copied().enumerate() {
        let node = leaf_count + merge_index;
        if left >= node || right >= node || ranges[left][1] != ranges[right][0] {
            debug_assert!(false, "dendrogram children are not topologically ordered");
            return;
        }
        ranges[node] = [ranges[left][0], ranges[right][1]];
    }

    // Square the original condensed matrix in traversal order. The dynamic
    // program reads the same distances many times, so this O(n²) buffer avoids
    // repeated condensed index arithmetic in the hot loops.
    let mut distances = vec![0.0f32; leaf_count * leaf_count];
    for sorted_left in 0..leaf_count {
        for sorted_right in (sorted_left + 1)..leaf_count {
            let original_left = leaf_order[sorted_left];
            let original_right = leaf_order[sorted_right];
            let (i, j) = if original_left < original_right {
                (original_left, original_right)
            } else {
                (original_right, original_left)
            };
            let condensed_index = leaf_count * i - i * (i + 1) / 2 + j - i - 1;
            let distance = condensed_distances[condensed_index];
            distances[sorted_left * leaf_count + sorted_right] = distance;
            distances[sorted_right * leaf_count + sorted_left] = distance;
        }
    }

    // `cost[a, b]` is the best path through the subtree whose outer leaves are
    // `a` and `b`. A leaf pair has one unique lowest common ancestor, so one
    // n×n table covers all subtree states.
    let mut cost = vec![0.0f64; leaf_count * leaf_count];

    for [left, right] in sorted_children.iter().copied() {
        let [left_start, boundary] = ranges[left];
        let right_end = ranges[right][1];
        let right_len = right_end - boundary;

        {
            // This merge writes rows `left_start..boundary` (at columns
            // `boundary..right_end`) and only reads rows `boundary..right_end`,
            // so the table splits into one mutable and one shared region.
            let (head, tail) = cost.split_at_mut(boundary * leaf_count);
            let left_rows = &mut head[left_start * leaf_count..];
            let right_rows = &tail[..right_len * leaf_count];

            // Fills row `u` of the endpoint table. Phase 1: for every right
            // inner endpoint `k`, the cheapest left path plus bridge,
            // `min over m of cost[u, m] + d(m, k)`. Phase 2: every right outer
            // endpoint `w` completes as `min over k of phase1[k] + cost[w, k]`.
            let fill_row = |u: usize, row_u: &mut [f64], head_costs: &mut Vec<f64>| {
                let [m0, m1] = partner_range(left, u, leaf_count, &sorted_children, &ranges);

                head_costs.clear();
                for k in boundary..right_end {
                    let bridges = &distances[k * leaf_count + m0..k * leaf_count + m1];
                    let mut best = f64::INFINITY;
                    for (path, bridge) in row_u[m0..m1].iter().copied().zip(bridges) {
                        best = best.min(path + f64::from(*bridge));
                    }
                    head_costs.push(best);
                }

                for w in boundary..right_end {
                    let [k0, k1] = partner_range(right, w, leaf_count, &sorted_children, &ranges);
                    let row_w = &right_rows[(w - boundary) * leaf_count..][..leaf_count];
                    let mut best = f64::INFINITY;
                    for (head_cost, tail_cost) in head_costs[k0 - boundary..k1 - boundary]
                        .iter()
                        .zip(&row_w[k0..k1])
                    {
                        best = best.min(head_cost + tail_cost);
                    }
                    row_u[w] = best;
                }
            };

            if (boundary - left_start) * right_len >= PARALLEL_CELL_THRESHOLD {
                left_rows
                    .par_chunks_mut(leaf_count)
                    .enumerate()
                    .for_each_init(
                        || Vec::with_capacity(right_len),
                        |head_costs, (offset, row_u)| {
                            fill_row(left_start + offset, row_u, head_costs)
                        },
                    );
            } else {
                let mut head_costs = Vec::with_capacity(right_len);
                for (offset, row_u) in left_rows.chunks_mut(leaf_count).enumerate() {
                    fill_row(left_start + offset, row_u, &mut head_costs);
                }
            }
        }

        // Later merges and the backtrack read both orientations of every pair.
        for w in boundary..right_end {
            for u in left_start..boundary {
                cost[w * leaf_count + u] = cost[u * leaf_count + w];
            }
        }
    }

    let [root_left, root_right] = sorted_children[merges.len() - 1];
    let mut best_root = (usize::MAX, usize::MAX);
    let mut best_cost = f64::INFINITY;
    for left_endpoint in ranges[root_left][0]..ranges[root_left][1] {
        for right_endpoint in ranges[root_right][0]..ranges[root_right][1] {
            let candidate = cost[left_endpoint * leaf_count + right_endpoint]
                + f64::from(distances[left_endpoint * leaf_count + right_endpoint]);
            if candidate < best_cost {
                best_cost = candidate;
                best_root = (left_endpoint, right_endpoint);
            }
        }
    }

    // Backtrack the chosen endpoint state and apply only child swaps. Node ids
    // remain stable, so all persisted merge metadata and every cluster cut are
    // unchanged. Each node's optimal inner endpoints are re-derived from the
    // children's costs — the argmin over `partner(first) × partner(last)`,
    // O(n²) summed over the whole tree — so the forward pass stores no
    // per-cell endpoints.
    let mut pending = vec![(root, best_root.0, best_root.1)];
    while let Some((node, first_leaf, last_leaf)) = pending.pop() {
        if node < leaf_count {
            debug_assert_eq!(first_leaf, last_leaf);
            continue;
        }

        let merge_index = node - leaf_count;
        let [sorted_left, sorted_right] = sorted_children[merge_index];
        let first_is_left =
            ranges[sorted_left][0] <= first_leaf && first_leaf < ranges[sorted_left][1];
        let (first_child, second_child) = if first_is_left {
            (sorted_left, sorted_right)
        } else {
            debug_assert!(
                ranges[sorted_right][0] <= first_leaf && first_leaf < ranges[sorted_right][1]
            );
            (sorted_right, sorted_left)
        };

        let [m0, m1] = partner_range(
            first_child,
            first_leaf,
            leaf_count,
            &sorted_children,
            &ranges,
        );
        let [k0, k1] = partner_range(
            second_child,
            last_leaf,
            leaf_count,
            &sorted_children,
            &ranges,
        );
        let mut best = f64::INFINITY;
        let mut best_inner = (m0, k0);
        for m in m0..m1 {
            let head_cost = cost[first_leaf * leaf_count + m];
            for k in k0..k1 {
                let candidate = head_cost
                    + f64::from(distances[m * leaf_count + k])
                    + cost[k * leaf_count + last_leaf];
                if candidate < best {
                    best = candidate;
                    best_inner = (m, k);
                }
            }
        }

        let original_left = merges[merge_index].left;
        let original_right = merges[merge_index].right;
        let (original_first, original_second) = if first_is_left {
            (original_left, original_right)
        } else {
            (original_right, original_left)
        };
        merges[merge_index].left = original_first;
        merges[merge_index].right = original_second;

        pending.push((second_child, best_inner.1, last_leaf));
        pending.push((first_child, first_leaf, best_inner.0));
    }
}

/// The admissible partner endpoints inside `node` when one path endpoint is
/// the leaf `endpoint`: a path through a merge enters one child and leaves
/// through the other, so the partner lies in the opposite child's leaf range;
/// a leaf is its own partner.
fn partner_range(
    node: usize,
    endpoint: usize,
    leaf_count: usize,
    sorted_children: &[[usize; 2]],
    ranges: &[[usize; 2]],
) -> [usize; 2] {
    if node < leaf_count {
        [endpoint, endpoint + 1]
    } else {
        let [first, second] = sorted_children[node - leaf_count];
        if endpoint < ranges[first][1] {
            ranges[second]
        } else {
            ranges[first]
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn merge(left: usize, right: usize, height: f32, representative: usize) -> DendrogramMerge {
        DendrogramMerge {
            left,
            right,
            height,
            representative,
        }
    }

    fn condensed_distances(points: &[f32]) -> Vec<f32> {
        let mut distances = Vec::with_capacity(points.len() * (points.len() - 1) / 2);
        for left in 0..points.len() {
            for right in (left + 1)..points.len() {
                distances.push((points[left] - points[right]).abs());
            }
        }
        distances
    }

    fn condensed_distances_2d(points: &[[f32; 2]]) -> Vec<f32> {
        let mut distances = Vec::with_capacity(points.len() * (points.len() - 1) / 2);
        for left in 0..points.len() {
            for right in (left + 1)..points.len() {
                distances.push(
                    ((points[left][0] - points[right][0]).powi(2)
                        + (points[left][1] - points[right][1]).powi(2))
                    .sqrt(),
                );
            }
        }
        distances
    }

    fn leaf_order(merges: &[DendrogramMerge], leaf_count: usize) -> Vec<usize> {
        if leaf_count == 1 {
            return vec![0];
        }
        let mut order = Vec::with_capacity(leaf_count);
        let mut stack = vec![leaf_count + merges.len() - 1];
        while let Some(node) = stack.pop() {
            if node < leaf_count {
                order.push(node);
            } else {
                let merge = &merges[node - leaf_count];
                stack.push(merge.right);
                stack.push(merge.left);
            }
        }
        order
    }

    fn path_cost(order: &[usize], distances: &[f32], leaf_count: usize) -> f64 {
        order
            .windows(2)
            .map(|pair| {
                let (left, right) = if pair[0] < pair[1] {
                    (pair[0], pair[1])
                } else {
                    (pair[1], pair[0])
                };
                let index = leaf_count * left - left * (left + 1) / 2 + right - left - 1;
                f64::from(distances[index])
            })
            .sum()
    }

    fn cyclic_cost(order: &[usize], distances: &[f32], leaf_count: usize) -> f64 {
        let mut cycle = order.to_vec();
        cycle.push(order[0]);
        path_cost(&cycle, distances, leaf_count)
    }

    fn all_leaf_orders(
        node: usize,
        merges: &[DendrogramMerge],
        leaf_count: usize,
    ) -> Vec<Vec<usize>> {
        if node < leaf_count {
            return vec![vec![node]];
        }
        let merge = &merges[node - leaf_count];
        let left_orders = all_leaf_orders(merge.left, merges, leaf_count);
        let right_orders = all_leaf_orders(merge.right, merges, leaf_count);
        let mut orders = Vec::with_capacity(left_orders.len() * right_orders.len() * 2);
        for left in &left_orders {
            for right in &right_orders {
                let mut forward = left.clone();
                forward.extend(right);
                orders.push(forward);

                let mut reversed = right.clone();
                reversed.extend(left);
                orders.push(reversed);
            }
        }
        orders
    }

    fn alternating_subtrees() -> Vec<DendrogramMerge> {
        vec![
            merge(0, 1, 0.1, 0),
            merge(2, 3, 0.1, 2),
            merge(4, 5, 0.1, 4),
            merge(6, 7, 0.1, 6),
            merge(8, 9, 0.5, 0),
            merge(10, 11, 0.5, 4),
            merge(12, 13, 1.0, 0),
        ]
    }

    #[test]
    fn finds_the_exact_best_order_and_preserves_the_tree() {
        // Four already-coherent subtrees arrive as serif, sans, serif, sans.
        // The tree permits sans, serif, serif, sans by flipping children, so
        // the two serif subtrees should become adjacent without changing any
        // merge membership or metadata.
        let points = [0.0, 0.1, 10.0, 10.1, 0.2, 0.3, 10.2, 10.3];
        let distances = condensed_distances(&points);
        let mut merges = alternating_subtrees();
        let original_merges = merges.clone();
        let root = points.len() + merges.len() - 1;
        let exhaustive_minimum = all_leaf_orders(root, &merges, points.len())
            .iter()
            .map(|order| cyclic_cost(order, &distances, points.len()))
            .fold(f64::INFINITY, f64::min);

        optimize_leaf_order(&mut merges, &distances, points.len());

        let optimized_order = leaf_order(&merges, points.len());
        let optimized_cost = cyclic_cost(&optimized_order, &distances, points.len());
        assert!((optimized_cost - exhaustive_minimum).abs() < 1e-6);

        let serif = [true, true, false, false, true, true, false, false];
        let cyclic_transitions = (0..optimized_order.len())
            .filter(|index| {
                serif[optimized_order[*index]]
                    != serif[optimized_order[(*index + 1) % optimized_order.len()]]
            })
            .count();
        assert_eq!(
            cyclic_transitions, 2,
            "optimized order: {optimized_order:?}"
        );

        for (before, after) in original_merges.iter().zip(&merges) {
            let mut before_children = [before.left, before.right];
            let mut after_children = [after.left, after.right];
            before_children.sort_unstable();
            after_children.sort_unstable();
            assert_eq!(before_children, after_children);
            assert_eq!(before.height.to_bits(), after.height.to_bits());
            assert_eq!(before.representative, after.representative);
        }
    }

    #[test]
    fn handles_degenerate_inputs_deterministically() {
        let mut single = Vec::new();
        optimize_leaf_order(&mut single, &[], 1);
        assert!(single.is_empty());

        let mut pair = vec![merge(0, 1, 0.5, 0)];
        optimize_leaf_order(&mut pair, &[0.5], 2);
        assert_eq!(leaf_order(&pair, 2), [0, 1]);

        let identical_distances = vec![0.0; 8 * 7 / 2];
        let mut first = alternating_subtrees();
        let mut second = first.clone();
        optimize_leaf_order(&mut first, &identical_distances, 8);
        optimize_leaf_order(&mut second, &identical_distances, 8);
        assert_eq!(leaf_order(&first, 8), leaf_order(&second, 8));
    }

    #[test]
    fn matches_exhaustive_search_for_balanced_and_unbalanced_trees() {
        let points = [
            [0.0f32, 0.0f32],
            [1.0, 4.0],
            [2.0, 1.0],
            [5.0, 2.0],
            [3.0, 7.0],
            [8.0, 0.0],
            [6.0, 6.0],
        ];
        let distances = condensed_distances_2d(&points);

        let trees = [
            vec![
                merge(0, 1, 0.1, 0),
                merge(2, 3, 0.1, 2),
                merge(4, 5, 0.1, 4),
                merge(7, 8, 0.3, 0),
                merge(9, 6, 0.4, 4),
                merge(10, 11, 1.0, 0),
            ],
            vec![
                merge(0, 1, 0.1, 0),
                merge(7, 2, 0.2, 0),
                merge(3, 4, 0.1, 3),
                merge(5, 6, 0.1, 5),
                merge(9, 10, 0.4, 3),
                merge(8, 11, 1.0, 0),
            ],
            // Scrambled leaf ids exercise the traversal-order relabelling and
            // the mapping back into the original condensed distance matrix.
            vec![
                merge(4, 1, 0.1, 4),
                merge(6, 0, 0.1, 6),
                merge(3, 5, 0.1, 3),
                merge(7, 8, 0.3, 4),
                merge(9, 2, 0.4, 3),
                merge(10, 11, 1.0, 4),
            ],
        ];

        for mut tree in trees {
            let root = points.len() + tree.len() - 1;
            let exhaustive_minimum = all_leaf_orders(root, &tree, points.len())
                .iter()
                .map(|order| cyclic_cost(order, &distances, points.len()))
                .fold(f64::INFINITY, f64::min);
            optimize_leaf_order(&mut tree, &distances, points.len());
            let optimized_cost =
                cyclic_cost(&leaf_order(&tree, points.len()), &distances, points.len());
            assert!((optimized_cost - exhaustive_minimum).abs() < 1e-6);
        }
    }

    /// Perf/equivalence probe on deterministic pseudo-random inputs: prints
    /// wall time, final cyclic cost and an order hash per size. Run with
    /// `cargo test --release -- --ignored --nocapture stress_random_probe`.
    #[test]
    #[ignore]
    fn stress_random_probe() {
        use kodama::{linkage, Method};

        for &(n, dims, seed) in &[
            (40usize, 12usize, 1u64),
            (150, 12, 2),
            (400, 12, 3),
            (800, 12, 4),
            (1200, 12, 5),
            (2400, 12, 6),
            (4800, 12, 7),
        ] {
            let mut state = seed;
            let mut next = move || {
                state = state
                    .wrapping_mul(6364136223846793005)
                    .wrapping_add(1442695040888963407);
                ((state >> 33) as f32) / ((1u64 << 31) as f32) - 0.5
            };
            let points: Vec<Vec<f32>> = (0..n)
                .map(|_| (0..dims).map(|_| next()).collect())
                .collect();
            let mut condensed = Vec::with_capacity(n * (n - 1) / 2);
            for i in 0..n {
                for j in (i + 1)..n {
                    condensed.push(
                        points[i]
                            .iter()
                            .zip(&points[j])
                            .map(|(a, b)| (a - b) * (a - b))
                            .sum::<f32>()
                            .sqrt(),
                    );
                }
            }
            let mut workspace = condensed.clone();
            let steps = linkage(&mut workspace, n, Method::Average);
            let mut merges: Vec<DendrogramMerge> = steps
                .steps()
                .iter()
                .map(|step| merge(step.cluster1, step.cluster2, step.dissimilarity, 0))
                .collect();

            let start = std::time::Instant::now();
            optimize_leaf_order(&mut merges, &condensed, n);
            let elapsed = start.elapsed();

            let order = leaf_order(&merges, n);
            let cost = cyclic_cost(&order, &condensed, n);
            let hash = order.iter().fold(0u64, |acc, &leaf| {
                acc.wrapping_mul(1099511628211)
                    .wrapping_add(leaf as u64 + 1)
            });
            println!("n={n} time={elapsed:?} cost={cost:.9} hash={hash:016x}");
        }
    }

    #[test]
    fn includes_the_radial_seam_in_the_objective() {
        let points = [
            [3.3, 2.9],
            [6.9, 2.7],
            [9.8, 9.7],
            [5.4, 8.6],
            [5.5, 5.4],
            [4.4, 6.2],
        ];
        let distances = condensed_distances_2d(&points);
        let mut tree = vec![
            merge(0, 1, 0.1, 0),
            merge(2, 3, 0.1, 2),
            merge(6, 4, 0.3, 0),
            merge(7, 5, 0.3, 2),
            merge(8, 9, 1.0, 0),
        ];
        let root = points.len() + tree.len() - 1;
        let orders = all_leaf_orders(root, &tree, points.len());
        let minimum_path = orders
            .iter()
            .map(|order| path_cost(order, &distances, points.len()))
            .fold(f64::INFINITY, f64::min);
        let best_linear_cycle = orders
            .iter()
            .filter(|order| {
                (path_cost(order, &distances, points.len()) - minimum_path).abs() < 1e-6
            })
            .map(|order| cyclic_cost(order, &distances, points.len()))
            .fold(f64::INFINITY, f64::min);
        let minimum_cycle = orders
            .iter()
            .map(|order| cyclic_cost(order, &distances, points.len()))
            .fold(f64::INFINITY, f64::min);

        optimize_leaf_order(&mut tree, &distances, points.len());

        let optimized_cycle =
            cyclic_cost(&leaf_order(&tree, points.len()), &distances, points.len());
        assert!((optimized_cycle - minimum_cycle).abs() < 1e-6);
        assert!(optimized_cycle < best_linear_cycle);
    }
}
