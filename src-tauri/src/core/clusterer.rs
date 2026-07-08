//! Clustering stage: groups fonts by visual similarity of their embeddings.
//!
//! Embeddings are optionally reduced with PCA, uniformly rescaled so the
//! largest pairwise distance is 1, and fed to agglomerative (hierarchical)
//! clustering via [`kodama`]. The dendrogram is cut by either a target cluster
//! count or a distance threshold (see [`ClusteringConfig`]), and the resulting
//! label is stored on each font.

use crate::commands::progress::progress_events;
use crate::config::{
    AttributeEmphasis, ClusterStat, ClusteringConfig, ClusteringData, ClusteringMethod,
    ClusteringStats, ComputedData, DendrogramData, DendrogramMerge, ProgressStage,
};
use crate::core::session::{
    load_computed_data, load_font_metadata, load_sample_vectors, save_computed_data,
    save_dendrogram,
};
use crate::core::{AppState, EventSink};
use crate::error::{AppError, Result};
use kodama::{linkage, Method as KodamaMethod};
use ndarray::{Array2, Axis};
use petal_decomposition::PcaBuilder;

/// Clusters every analysed font in the active session and persists the labels.
///
/// Reads the embeddings, reduces/rescales them, runs agglomerative
/// clustering, writes each font's cluster index, and records the cluster and
/// sample counts on the session status. A no-op when there is nothing to
/// cluster.
pub async fn cluster_all(events: &impl EventSink, state: &AppState) -> Result<()> {
    let session_dir = state.get_session_dir()?;

    let config = {
        let guard = state
            .current_session
            .lock()
            .map_err(|_| AppError::Processing("Lock poisoned".into()))?;
        guard
            .as_ref()
            .map(|s| s.algorithm.clustering.clone())
            .ok_or_else(|| AppError::Processing("No active session".into()))?
    };
    let preprocessing_dimensions = config.preprocessing_dimensions;
    let attribute_emphasis = config.attribute_emphasis;
    let session_dir_for_first = session_dir.clone();

    let (points, ids) =
        tokio::task::spawn_blocking(move || -> Result<(Array2<f32>, Vec<String>)> {
            let (vectors, ids) = load_sample_vectors(&session_dir_for_first)?;
            if vectors.is_empty() {
                return Ok((Array2::zeros((0, 0)), ids));
            }

            let n_samples = vectors.len();
            let n_features = vectors[0].len();
            let data = Array2::from_shape_vec(
                (n_samples, n_features),
                vectors.into_iter().flatten().collect(),
            )
            .map_err(|e| AppError::Processing(e.to_string()))?;

            let data = apply_attribute_emphasis(data, &attribute_emphasis);

            let points = if n_samples < 2 || n_features <= preprocessing_dimensions {
                data
            } else {
                pca_embedding(data, preprocessing_dimensions)?
            };

            Ok((points, ids))
        })
        .await
        .map_err(|e| AppError::Processing(e.to_string()))??;

    if points.is_empty() {
        return Ok(());
    }

    let n_samples = points.nrows();
    let (labels, join_heights, merges, stats) = agglomerative_clustering(points, &config)?;
    let n_clusters = stats.clusters.len();

    progress_events::reset_progress(events, state, ProgressStage::Clustering);
    progress_events::set_progress_denominator(
        events,
        state,
        ProgressStage::Clustering,
        ids.len() as i32,
    );

    // The full merge tree over the sample ids, persisted so the UI can draw
    // the dendrogram over the graph without re-clustering.
    let dendrogram = DendrogramData { ids, merges };

    // Each font's persisted clustering carries its cluster's palette slot, so
    // drawables read `k` and `color_index` from one place.
    let color_by_label: Vec<usize> = stats
        .clusters
        .iter()
        .map(|cluster| cluster.color_index)
        .collect();

    let session_dir_for_second = session_dir.clone();
    let events = events.clone();
    let state_clone = state.clone();
    tokio::task::spawn_blocking(move || -> Result<()> {
        save_dendrogram(&session_dir_for_second, &dendrogram)?;
        for (i, id) in dendrogram.ids.iter().enumerate() {
            let meta = load_font_metadata(&session_dir_for_second, id)?;
            let mut computed =
                load_computed_data(&session_dir_for_second, id).unwrap_or(ComputedData {
                    rendered_text: None,
                    clustering: None,
                });
            computed.clustering = Some(ClusteringData {
                k: labels[i],
                join_height: join_heights[i],
                // Every point lands in an active cluster, so `labels[i]` is a
                // valid index into the per-label colors.
                color_index: color_by_label[labels[i] as usize],
            });
            save_computed_data(&session_dir_for_second, &meta.safe_name, &computed)?;
            progress_events::increase_numerator(
                &events,
                &state_clone,
                ProgressStage::Clustering,
                1,
            );
        }
        Ok(())
    })
    .await
    .map_err(|e| AppError::Processing(e.to_string()))??;

    state.update_status(|s| {
        s.process_status = crate::config::ProcessStatus::Clustered;
        s.clusters_amount = n_clusters;
        s.samples_amount = n_samples;
        s.clustering_stats = stats;
    })?;

    Ok(())
}

/// Rescales the model's attribute directions inside the feature vectors.
///
/// For each non-zero emphasis level `l`, the component of every embedding
/// along that attribute's direction `w` (from `attribute_directions.json`
/// beside the model) is scaled by `2^l`: `x' = x + (2^l - 1) * (x . w) * w`.
/// Rows are re-normalized afterwards to keep the unit-norm invariant of the
/// raw embeddings. Falls back to the untouched data (with a log line) when
/// the directions asset is missing or malformed, so clustering never fails
/// on account of emphasis.
fn apply_attribute_emphasis(data: Array2<f32>, emphasis: &AttributeEmphasis) -> Array2<f32> {
    let active = emphasis.active_levels();
    if active.is_empty() {
        return data;
    }

    let directions = match load_attribute_directions(data.ncols()) {
        Ok(directions) => directions,
        Err(e) => {
            println!("⚠️ Clusterer: attribute emphasis skipped: {e}");
            return data;
        }
    };

    let mut data = data;
    for (name, level) in active {
        let Some(w) = directions.get(name) else {
            println!("⚠️ Clusterer: no direction for attribute '{name}', skipped");
            continue;
        };
        // clamp defensively: the UI offers -4..=4, session files could say anything
        let scale = 2f32.powi(i32::from(level.clamp(-4, 4))) - 1.0;
        for mut row in data.axis_iter_mut(Axis(0)) {
            let component: f32 = row.iter().zip(w).map(|(x, w)| x * w).sum();
            row.iter_mut()
                .zip(w)
                .for_each(|(x, w)| *x += scale * component * w);
        }
    }

    // restore the unit-norm invariant so distances stay comparable
    for mut row in data.axis_iter_mut(Axis(0)) {
        let norm = row.iter().map(|x| x * x).sum::<f32>().sqrt().max(1e-12);
        row.iter_mut().for_each(|x| *x /= norm);
    }
    data
}

/// Loads `attribute_directions.json` from the model directory as
/// `name -> unit direction vector`, validating the dimensionality.
fn load_attribute_directions(
    expected_dim: usize,
) -> Result<std::collections::HashMap<String, Vec<f32>>> {
    #[derive(serde::Deserialize)]
    struct DirectionsFile {
        dim: usize,
        attributes: std::collections::HashMap<String, DirectionEntry>,
    }
    #[derive(serde::Deserialize)]
    struct DirectionEntry {
        direction: Vec<f32>,
    }

    let path = crate::core::analyzer::resolve_model_dir()?.join("attribute_directions.json");
    let raw = std::fs::read_to_string(&path)
        .map_err(|e| AppError::Io(format!("{} unreadable: {e}", path.display())))?;
    let parsed: DirectionsFile =
        serde_json::from_str(&raw).map_err(|e| AppError::Processing(e.to_string()))?;
    if parsed.dim != expected_dim {
        return Err(AppError::Processing(format!(
            "attribute directions are {}-d but embeddings are {}-d",
            parsed.dim, expected_dim
        )));
    }
    Ok(parsed
        .attributes
        .into_iter()
        .map(|(name, entry)| (name, entry.direction))
        .collect())
}

/// Reduces `data` to at most `dimensions` principal components.
///
/// `dimensions` is clamped to the rank limit (`min(n_samples, n_features)`).
/// Errors when there are too few samples or features for PCA to be defined.
fn pca_embedding(data: Array2<f32>, dimensions: usize) -> Result<Array2<f32>> {
    let (n_samples, n_features) = data.dim();
    if n_samples < 2 {
        return Err(AppError::Processing(
            "PCA requires at least two feature vectors".into(),
        ));
    }
    if n_features < 2 {
        return Err(AppError::Processing(
            "PCA requires at least two features".into(),
        ));
    }

    let dimensions = dimensions.clamp(1, n_samples.min(n_features));

    PcaBuilder::new(dimensions)
        .build()
        .fit_transform(&data)
        .map_err(|e| AppError::Processing(e.to_string()))
}

/// Runs agglomerative clustering and returns the per-point `labels`, the
/// per-point join heights (each font's first-merge dissimilarity, an isolation
/// score), the full merge tree (see [`DendrogramMerge`]), and the
/// [`ClusteringStats`] captured for the run.
///
/// All pairwise Euclidean distances are computed on the points as given (the
/// PCA scores), then points and distances are uniformly rescaled so the
/// largest pairwise distance is 1. A uniform rescale preserves every distance
/// ratio — the merge tree is exactly the raw-PCA one — while keeping
/// `config.distance_threshold` readable as a fraction of the point-cloud
/// diameter regardless of model or PCA scale. The distances are fed to
/// [`kodama::linkage`], and the resulting dendrogram is replayed merge by
/// merge until a stop criterion is hit:
/// - if `config.target_cluster_count > 0`, stop once that many clusters
///   remain;
/// - otherwise, if `config.distance_threshold > 0`, stop before any merge
///   above that distance;
/// - otherwise no merges are applied (every point is its own cluster).
///
/// `labels[i]` is the cluster index of point `i`; clusters are numbered by
/// their smallest member index for stable, deterministic ids. The stats are a
/// free by-product of the replay (per-cluster size/centroid/diameter, the cut
/// height, and the full merge-height sequence).
fn agglomerative_clustering(
    points: Array2<f32>,
    config: &ClusteringConfig,
) -> Result<(Vec<i32>, Vec<f32>, Vec<DendrogramMerge>, ClusteringStats)> {
    let n = points.nrows();
    if n == 1 {
        // A lone point is its own cluster, never merges (join height 0), and
        // is its own centroid.
        let stats = ClusteringStats {
            clusters: vec![ClusterStat {
                size: 1,
                centroid: points.row(0).to_vec(),
                diameter: 0.0,
                color_index: 0,
            }],
            cut_height: 0.0,
            merge_heights: Vec::new(),
        };
        return Ok((vec![0], vec![0.0], Vec::new(), stats));
    }

    let mut condensed = Vec::with_capacity((n * (n - 1)) / 2);

    for i in 0..n {
        for j in (i + 1)..n {
            condensed.push(point_distance(&points, i, j));
        }
    }

    // Unit-diameter rescale: points and pairwise distances divided by the
    // largest pairwise distance, so downstream heights/centroids stay in one
    // consistent space (identical points leave everything at scale 1).
    let max_distance = condensed.iter().copied().fold(0.0f32, f32::max);
    let points = if max_distance > 0.0 {
        for distance in &mut condensed {
            *distance /= max_distance;
        }
        points.mapv_into(|value| value / max_distance)
    } else {
        points
    };

    let dendrogram = linkage(&mut condensed, n, kodama_method(config.method));
    // Every merge (full tree), plus per-leaf the height at which each point is
    // first absorbed — its isolation. A leaf is a direct operand of exactly
    // one merge, so this fills every entry in one pass.
    //
    // Alongside, each node's running centroid/size feed the representative
    // propagation: a merge's representative is whichever child representative
    // sits closer to the merged centroid (an incremental medoid
    // approximation), so the UI can put one exemplar sample on a merge node.
    let mut merge_heights = Vec::with_capacity(dendrogram.steps().len());
    let mut merges = Vec::with_capacity(dendrogram.steps().len());
    let mut join_heights = vec![0.0f32; n];
    let mut centroids: Vec<Vec<f32>> = (0..n).map(|i| points.row(i).to_vec()).collect();
    let mut sizes: Vec<usize> = vec![1; n];
    let mut representatives: Vec<usize> = (0..n).collect();
    for step in dendrogram.steps() {
        merge_heights.push(step.dissimilarity);
        let (left, right) = (step.cluster1, step.cluster2);
        let total = (sizes[left] + sizes[right]) as f32;
        let centroid: Vec<f32> = centroids[left]
            .iter()
            .zip(&centroids[right])
            .map(|(l, r)| (l * sizes[left] as f32 + r * sizes[right] as f32) / total)
            .collect();
        // `<=` keeps ties on the left operand for determinism.
        let representative = if squared_distance_to(&points, representatives[left], &centroid)
            <= squared_distance_to(&points, representatives[right], &centroid)
        {
            representatives[left]
        } else {
            representatives[right]
        };
        merges.push(DendrogramMerge {
            left,
            right,
            height: step.dissimilarity,
            representative,
        });
        sizes.push(sizes[left] + sizes[right]);
        centroids.push(centroid);
        representatives.push(representative);
        if left < n {
            join_heights[left] = step.dissimilarity;
        }
        if right < n {
            join_heights[right] = step.dissimilarity;
        }
    }
    let mut active_count = n;
    let target_cluster_count =
        (config.target_cluster_count > 0).then(|| config.target_cluster_count.clamp(1, n));
    let distance_threshold = (config.distance_threshold > 0.0).then_some(config.distance_threshold);

    let mut clusters = vec![Vec::new(); (2 * n) - 1];
    let mut active = vec![false; (2 * n) - 1];
    // Linkage height at which each internal node formed; leaves stay 0.
    let mut node_height = vec![0.0f32; (2 * n) - 1];
    let mut cut_height = 0.0f32;
    for i in 0..n {
        clusters[i].push(i);
        active[i] = true;
    }

    for (step_index, step) in dendrogram.steps().iter().enumerate() {
        if let Some(target_cluster_count) = target_cluster_count {
            if active_count <= target_cluster_count {
                break;
            }
        } else if distance_threshold.is_none() {
            break;
        }
        if let Some(threshold) = distance_threshold {
            if step.dissimilarity > threshold {
                break;
            }
        }

        let new_label = n + step_index;
        let left = step.cluster1;
        let right = step.cluster2;
        let mut members = Vec::with_capacity(step.size);
        members.extend_from_slice(&clusters[left]);
        members.extend_from_slice(&clusters[right]);
        clusters[new_label] = members;
        // Merges replay in ascending dissimilarity, so the last applied merge
        // is both this node's height and the overall cut height.
        node_height[new_label] = step.dissimilarity;
        cut_height = step.dissimilarity;
        active[left] = false;
        active[right] = false;
        active[new_label] = true;
        active_count -= 1;
    }

    let mut active_clusters = active
        .iter()
        .enumerate()
        .filter(|(_, is_active)| **is_active)
        .map(|(node, _)| (node, clusters[node].clone()))
        .collect::<Vec<_>>();
    active_clusters.sort_by_key(|(_, members)| members.iter().copied().min().unwrap_or(usize::MAX));

    let mut labels = vec![-1; n];
    for (cluster_id, (_, members)) in active_clusters.iter().enumerate() {
        for point_index in members {
            labels[*point_index] = cluster_id as i32;
        }
    }

    let color_indices = assign_color_indices(&active_clusters, &dendrogram, n);

    let cluster_stats = active_clusters
        .iter()
        .zip(&color_indices)
        .map(|((node, members), color_index)| ClusterStat {
            size: members.len(),
            centroid: points
                .select(Axis(0), members)
                .mean_axis(Axis(0))
                .map(|centroid| centroid.to_vec())
                .unwrap_or_default(),
            diameter: node_height[*node],
            color_index: *color_index,
        })
        .collect();

    Ok((
        labels,
        join_heights,
        merges,
        ClusteringStats {
            clusters: cluster_stats,
            cut_height,
            merge_heights,
        },
    ))
}

/// Number of distinct cluster colors the UI palette provides; must stay in
/// sync with the `--cluster-1..8` variables in `index.css` (see the frontend's
/// `cluster-colors` modules).
const CLUSTER_COLOR_COUNT: usize = 8;

/// Assigns each active cluster a palette slot such that clusters drawn next to
/// each other never share one.
///
/// The UI's only layout is the radial dendrogram: leaves sit on a ring in
/// left-first pre-order of the merge tree, so every cluster occupies one
/// contiguous arc and two clusters are visually adjacent exactly when their
/// arcs are consecutive on the ring (cyclically — the first and last arc touch
/// at the seam). Walking the tree with the same traversal order as the UI
/// yields that ring order.
///
/// Every cluster starts from its historical color, `label % palette` — labels
/// are numbered by smallest member index, so the slots land on the ring in no
/// meaningful order (deliberately: a palette cycled along the ring would read
/// as a hue wheel). One pass around the ring then repairs collisions only:
/// a cluster that matches its predecessor (or, for the last cluster, the first
/// one across the seam) moves to the nearest following slot free of both its
/// neighbours, so untouched clusters keep their id-derived color. With at most
/// `palette` clusters the id-derived slots are already pairwise distinct and
/// nothing moves.
///
/// Returns one palette slot per cluster, in `active_clusters` (label) order.
fn assign_color_indices(
    active_clusters: &[(usize, Vec<usize>)],
    dendrogram: &kodama::Dendrogram<f32>,
    leaf_count: usize,
) -> Vec<usize> {
    let node_count = leaf_count + dendrogram.steps().len();
    let mut label_of_node = vec![usize::MAX; node_count];
    for (label, (node, _)) in active_clusters.iter().enumerate() {
        label_of_node[*node] = label;
    }

    // Left-first pre-order over the full merge tree (right child pushed first,
    // matching the UI's leaf placement), stopping at active cluster roots:
    // the order they are met is their ring order.
    let mut ring_order = Vec::with_capacity(active_clusters.len());
    let mut stack = vec![node_count - 1];
    while let Some(node) = stack.pop() {
        if label_of_node[node] != usize::MAX {
            ring_order.push(label_of_node[node]);
            continue;
        }
        let step = &dendrogram.steps()[node - leaf_count];
        stack.push(step.cluster2);
        stack.push(step.cluster1);
    }

    let cluster_count = ring_order.len();
    let mut color_indices: Vec<usize> = (0..active_clusters.len())
        .map(|label| label % CLUSTER_COLOR_COUNT)
        .collect();

    // Repair pass around the ring. The first cluster never moves; each later
    // one is checked against its already-final predecessor — plus, for the
    // last cluster, the first one across the seam. A moved cluster also
    // avoids its successor's current slot, so a repair never creates the
    // next pair's collision and untouched clusters keep their id-derived
    // color. Two forbidden slots always leave a free one in a palette of 8.
    for rank in 1..cluster_count {
        let label = ring_order[rank];
        let previous = color_indices[ring_order[rank - 1]];
        let next = color_indices[ring_order[(rank + 1) % cluster_count]];
        let collides = color_indices[label] == previous
            || (rank == cluster_count - 1 && color_indices[label] == next);
        if !collides {
            continue;
        }
        let base = color_indices[label];
        color_indices[label] = (1..CLUSTER_COLOR_COUNT)
            .map(|offset| (base + offset) % CLUSTER_COLOR_COUNT)
            .find(|slot| *slot != previous && *slot != next)
            .unwrap_or(base);
    }

    color_indices
}

/// Squared Euclidean distance from row `row` of `points` to `target` (for
/// comparisons only, so the square root is skipped).
fn squared_distance_to(points: &Array2<f32>, row: usize, target: &[f32]) -> f32 {
    points
        .row(row)
        .iter()
        .zip(target)
        .map(|(a, b)| {
            let delta = a - b;
            delta * delta
        })
        .sum()
}

/// Euclidean distance between rows `left` and `right` of `points`.
fn point_distance(points: &Array2<f32>, left: usize, right: usize) -> f32 {
    points
        .row(left)
        .iter()
        .zip(points.row(right).iter())
        .map(|(left, right)| {
            let delta = left - right;
            delta * delta
        })
        .sum::<f32>()
        .sqrt()
}

/// Maps the config's [`ClusteringMethod`] onto the equivalent
/// [`kodama::Method`].
fn kodama_method(method: ClusteringMethod) -> KodamaMethod {
    match method {
        ClusteringMethod::Single => KodamaMethod::Single,
        ClusteringMethod::Complete => KodamaMethod::Complete,
        ClusteringMethod::Average => KodamaMethod::Average,
        ClusteringMethod::Weighted => KodamaMethod::Weighted,
        ClusteringMethod::Ward => KodamaMethod::Ward,
        ClusteringMethod::Centroid => KodamaMethod::Centroid,
        ClusteringMethod::Median => KodamaMethod::Median,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Emphasis at level 0 must be a strict no-op (no asset access either).
    #[test]
    fn emphasis_zero_is_noop() {
        let data = Array2::from_shape_vec((2, 3), vec![1.0, 0.0, 0.0, 0.0, 1.0, 0.0]).unwrap();
        let emphasis = AttributeEmphasis::default();
        let out = apply_attribute_emphasis(data.clone(), &emphasis);
        assert_eq!(out, data);
    }

    /// The real asset loads, matches the embedding dimension, and a non-zero
    /// level reweights vectors while keeping them unit-norm.
    #[test]
    fn emphasis_reweights_along_asset_directions() {
        let directions = match load_attribute_directions(512) {
            Ok(d) => d,
            // models/ is developer-local; skip rather than fail on CI
            Err(_) => return,
        };
        let w = directions.get("serif").expect("serif direction present");
        let norm: f32 = w.iter().map(|x| x * x).sum::<f32>().sqrt();
        assert!((norm - 1.0).abs() < 1e-3, "direction should be unit norm");

        // one row along w (max serif component), one row orthogonal-ish
        let mut a = w.clone();
        let mut b = vec![0.0f32; 512];
        b[0] = 1.0;
        let dot_bw: f32 = b.iter().zip(w).map(|(x, y)| x * y).sum();
        b.iter_mut().zip(w).for_each(|(x, y)| *x -= dot_bw * y); // orthogonalize
        let bnorm: f32 = b.iter().map(|x| x * x).sum::<f32>().sqrt();
        b.iter_mut().for_each(|x| *x /= bnorm);
        a.extend_from_slice(&b);
        let data = Array2::from_shape_vec((2, 512), a).unwrap();

        let emphasis = AttributeEmphasis {
            serif: 2,
            ..Default::default()
        };
        let out = apply_attribute_emphasis(data, &emphasis);

        // row norms restored
        for row in out.axis_iter(Axis(0)) {
            let n: f32 = row.iter().map(|x| x * x).sum::<f32>().sqrt();
            assert!((n - 1.0).abs() < 1e-3);
        }
        // the along-w row is invariant up to renormalization (still ~parallel to w)
        let cos_a: f32 = out.row(0).iter().zip(w).map(|(x, y)| x * y).sum();
        assert!(cos_a > 0.999, "along-direction row stays aligned, got {cos_a}");
        // the orthogonal row keeps ~zero serif component
        let cos_b: f32 = out.row(1).iter().zip(w).map(|(x, y)| x * y).sum();
        assert!(cos_b.abs() < 1e-3, "orthogonal row stays orthogonal, got {cos_b}");
    }
}
