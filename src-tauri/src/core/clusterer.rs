//! Clustering stage: groups fonts by visual similarity of their embeddings.
//!
//! Embeddings are optionally reduced with PCA, min-max normalised, and fed to
//! agglomerative (hierarchical) clustering via [`kodama`]. The dendrogram is
//! cut by either a target cluster count or a distance threshold (see
//! [`ClusteringConfig`]), and the resulting label is stored on each font.

use crate::commands::progress::progress_events;
use crate::config::{
    ClusterStat, ClusteringConfig, ClusteringData, ClusteringMethod, ClusteringStats, ComputedData,
    DendrogramData, DendrogramMerge, ProgressStage,
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
/// Reads the embeddings, reduces/normalises them, runs agglomerative
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
                    positioning: None,
                    clustering: None,
                });
            computed.clustering = Some(ClusteringData {
                k: labels[i],
                join_height: join_heights[i],
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
/// Points are min-max normalised, all pairwise Euclidean distances are fed to
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
        // A lone point is its own cluster, never merges (join height 0), and a
        // single min-max normalised row is all zeros, so its centroid is the
        // zero vector.
        let stats = ClusteringStats {
            clusters: vec![ClusterStat {
                size: 1,
                centroid: vec![0.0; points.ncols()],
                diameter: 0.0,
            }],
            cut_height: 0.0,
            merge_heights: Vec::new(),
        };
        return Ok((vec![0], vec![0.0], Vec::new(), stats));
    }

    let normalized = normalize_points(&points);
    let mut condensed = Vec::with_capacity((n * (n - 1)) / 2);

    for i in 0..n {
        for j in (i + 1)..n {
            condensed.push(point_distance(&normalized, i, j));
        }
    }

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
    let mut centroids: Vec<Vec<f32>> = (0..n).map(|i| normalized.row(i).to_vec()).collect();
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
        let representative = if squared_distance_to(&normalized, representatives[left], &centroid)
            <= squared_distance_to(&normalized, representatives[right], &centroid)
        {
            representatives[left]
        } else {
            representatives[right]
        };
        merges.push(DendrogramMerge {
            left,
            right,
            height: step.dissimilarity,
            representative: Some(representative),
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
    active_clusters
        .sort_by_key(|(_, members)| members.iter().copied().min().unwrap_or(usize::MAX));

    let mut labels = vec![-1; n];
    for (cluster_id, (_, members)) in active_clusters.iter().enumerate() {
        for point_index in members {
            labels[*point_index] = cluster_id as i32;
        }
    }

    let cluster_stats = active_clusters
        .iter()
        .map(|(node, members)| ClusterStat {
            size: members.len(),
            centroid: normalized
                .select(Axis(0), members)
                .mean_axis(Axis(0))
                .map(|centroid| centroid.to_vec())
                .unwrap_or_default(),
            diameter: node_height[*node],
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

/// Min-max normalises each column (feature) into `[0, 1]`, mapping
/// zero-variance columns to `0`.
fn normalize_points(points: &Array2<f32>) -> Array2<f32> {
    let mut normalized = points.clone();
    for axis in 0..points.ncols() {
        let column = points.column(axis);
        let min = column.iter().copied().fold(f32::INFINITY, f32::min);
        let max = column.iter().copied().fold(f32::NEG_INFINITY, f32::max);
        let range = max - min;
        for value in normalized.column_mut(axis).iter_mut() {
            *value = if range > 0.0 {
                (*value - min) / range
            } else {
                0.0
            };
        }
    }
    normalized
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
