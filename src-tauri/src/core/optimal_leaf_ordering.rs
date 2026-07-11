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

use crate::config::DendrogramMerge;

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

    // Square the original condensed matrix in traversal order. OLO reads the
    // same distances many times, so this O(n²) buffer avoids repeated condensed
    // index arithmetic in the hot dynamic-programming loop.
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
    // n×n table covers all subtree states. `inner_endpoints` stores the two
    // leaves joined across that ancestor and gives exact backtracking instead
    // of recomputing decisions after the cost pass.
    let mut cost = vec![0.0f64; leaf_count * leaf_count];
    let mut inner_endpoints = vec![(u32::MAX, u32::MAX); leaf_count * leaf_count];

    for (merge_index, [left, right]) in sorted_children.iter().copied().enumerate() {
        let mut left_endpoint_pairs = [([0usize; 2], [0usize; 2]); 2];
        let left_pair_count = if left < leaf_count {
            left_endpoint_pairs[0] = (ranges[left], ranges[left]);
            1
        } else {
            let [left_left, left_right] = sorted_children[left - leaf_count];
            left_endpoint_pairs[0] = (ranges[left_left], ranges[left_right]);
            left_endpoint_pairs[1] = (ranges[left_right], ranges[left_left]);
            2
        };

        let mut right_endpoint_pairs = [([0usize; 2], [0usize; 2]); 2];
        let right_pair_count = if right < leaf_count {
            right_endpoint_pairs[0] = (ranges[right], ranges[right]);
            1
        } else {
            let [right_left, right_right] = sorted_children[right - leaf_count];
            // The right subtree is traversed from its inner endpoint to its
            // outer endpoint, so store these as `(outer, inner)` ranges.
            right_endpoint_pairs[0] = (ranges[right_right], ranges[right_left]);
            right_endpoint_pairs[1] = (ranges[right_left], ranges[right_right]);
            2
        };

        for &(u_range, m_range) in &left_endpoint_pairs[..left_pair_count] {
            for &(w_range, k_range) in &right_endpoint_pairs[..right_pair_count] {
                let mut minimum_bridge_distance = f64::INFINITY;
                for m in m_range[0]..m_range[1] {
                    for k in k_range[0]..k_range[1] {
                        minimum_bridge_distance =
                            minimum_bridge_distance.min(f64::from(distances[m * leaf_count + k]));
                    }
                }

                // For a fixed right outer endpoint, visit candidate inner
                // endpoints by their already-known subtree cost. Combined
                // with the minimum bridge distance this supplies a valid lower
                // bound and prunes the otherwise quartic recurrence heavily.
                let sorted_k_by_w = (w_range[0]..w_range[1])
                    .map(|w| {
                        let mut candidates = (k_range[0]..k_range[1]).collect::<Vec<_>>();
                        candidates.sort_unstable_by(|a, b| {
                            cost[w * leaf_count + *a]
                                .total_cmp(&cost[w * leaf_count + *b])
                                .then_with(|| a.cmp(b))
                        });
                        candidates
                    })
                    .collect::<Vec<_>>();

                for u in u_range[0]..u_range[1] {
                    let mut sorted_m = (m_range[0]..m_range[1]).collect::<Vec<_>>();
                    sorted_m.sort_unstable_by(|a, b| {
                        cost[u * leaf_count + *a]
                            .total_cmp(&cost[u * leaf_count + *b])
                            .then_with(|| a.cmp(b))
                    });

                    for w in w_range[0]..w_range[1] {
                        let sorted_k = &sorted_k_by_w[w - w_range[0]];
                        let cheapest_k = sorted_k[0];
                        let mut best_cost = f64::INFINITY;
                        let mut best_inner = (usize::MAX, usize::MAX);

                        for &m in &sorted_m {
                            let left_cost = cost[u * leaf_count + m];
                            if left_cost
                                + cost[w * leaf_count + cheapest_k]
                                + minimum_bridge_distance
                                >= best_cost
                            {
                                break;
                            }

                            for &k in sorted_k {
                                let right_cost = cost[w * leaf_count + k];
                                if left_cost + right_cost + minimum_bridge_distance >= best_cost {
                                    break;
                                }
                                let candidate = left_cost
                                    + right_cost
                                    + f64::from(distances[m * leaf_count + k]);
                                if candidate < best_cost {
                                    best_cost = candidate;
                                    best_inner = (m, k);
                                }
                            }
                        }

                        debug_assert!(best_inner.0 != usize::MAX);
                        cost[u * leaf_count + w] = best_cost;
                        cost[w * leaf_count + u] = best_cost;
                        inner_endpoints[u * leaf_count + w] =
                            (best_inner.0 as u32, best_inner.1 as u32);
                        inner_endpoints[w * leaf_count + u] =
                            (best_inner.1 as u32, best_inner.0 as u32);
                    }
                }
            }
        }

        debug_assert_eq!(
            ranges[leaf_count + merge_index],
            [ranges[left][0], ranges[right][1]]
        );
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
    // unchanged.
    let mut pending = vec![(root, best_root.0, best_root.1)];
    while let Some((node, first_leaf, last_leaf)) = pending.pop() {
        if node < leaf_count {
            debug_assert_eq!(first_leaf, last_leaf);
            continue;
        }

        let merge_index = node - leaf_count;
        let [sorted_left, sorted_right] = sorted_children[merge_index];
        let original_left = merges[merge_index].left;
        let original_right = merges[merge_index].right;
        let first_is_left =
            ranges[sorted_left][0] <= first_leaf && first_leaf < ranges[sorted_left][1];
        let (first_child, second_child) = if first_is_left {
            (original_left, original_right)
        } else {
            debug_assert!(
                ranges[sorted_right][0] <= first_leaf && first_leaf < ranges[sorted_right][1]
            );
            (original_right, original_left)
        };

        let (first_inner, second_inner) = inner_endpoints[first_leaf * leaf_count + last_leaf];
        debug_assert_ne!(first_inner, u32::MAX);
        merges[merge_index].left = first_child;
        merges[merge_index].right = second_child;

        pending.push((second_child, second_inner as usize, last_leaf));
        pending.push((first_child, first_leaf, first_inner as usize));
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
