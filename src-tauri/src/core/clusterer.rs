//! Clustering stage: groups fonts by visual similarity of their embeddings.
//!
//! Embeddings are optionally reduced with PCA, uniformly rescaled so the
//! largest pairwise distance is 1, and fed to agglomerative (hierarchical)
//! clustering via [`kodama`]. The dendrogram is cut by either a target cluster
//! count or a distance threshold (see [`ClusteringConfig`]), and the resulting
//! label is stored on each font.

use crate::commands::progress::progress_events;
use crate::config::{
    ClusterStat, ClusteringConfig, ClusteringData, ClusteringMethod, ClusteringStats, ComputedData,
    DendrogramData, DendrogramMerge, ProgressStage,
};
use crate::core::optimal_leaf_ordering::optimize_leaf_order;
use crate::core::session::{
    load_computed_data, load_font_metadata, load_sample_vectors, save_computed_data,
    save_dendrogram,
};
use crate::core::{AppState, EventSink};
use crate::error::{AppError, Result};
use kodama::{linkage, Method as KodamaMethod};
use ndarray::{arr2, concatenate, Array1, Array2, ArrayView2, Axis};
use petal_decomposition::PcaBuilder;
use std::collections::{BTreeMap, HashMap};

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
    // The enable switch gates the whole feature: when off, hand the feature
    // builder an empty map so it takes the plain no-emphasis path, while the
    // stored levels stay untouched in the session.
    let emphasis = if config.enable_attribute_emphasis {
        config.emphasis.clone()
    } else {
        BTreeMap::new()
    };
    let session_dir_for_first = session_dir.clone();

    let ClusterInputs {
        points,
        scatter,
        ids,
    } = tokio::task::spawn_blocking(move || -> Result<ClusterInputs> {
        let (vectors, ids) = load_sample_vectors(&session_dir_for_first)?;
        if vectors.is_empty() {
            return Ok(ClusterInputs {
                points: Array2::zeros((0, 0)),
                scatter: Vec::new(),
                ids,
            });
        }

        let n_samples = vectors.len();
        let n_features = vectors[0].len();
        let data = Array2::from_shape_vec(
            (n_samples, n_features),
            vectors.into_iter().flatten().collect(),
        )
        .map_err(|e| AppError::Processing(e.to_string()))?;

        let points = build_cluster_features(data, preprocessing_dimensions, &emphasis)?;
        let scatter = scatter_projection(&points)?;

        Ok(ClusterInputs {
            points,
            scatter,
            ids,
        })
    })
    .await
    .map_err(|e| AppError::Processing(e.to_string()))??;

    if points.is_empty() {
        return Ok(());
    }

    let n_samples = points.nrows();
    // Linkage plus leaf ordering is CPU-bound (up to O(n³)); run it off the
    // async runtime like the other heavy stages.
    let (labels, join_heights, merges, stats) =
        tokio::task::spawn_blocking(move || agglomerative_clustering(points, &config))
            .await
            .map_err(|e| AppError::Processing(e.to_string()))??;
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
                two: Some(scatter[i]),
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

/// Output of the feature stage of [`cluster_all`]: the clustering feature
/// matrix, the per-font 2-D scatter coordinates, and the font ids, all in the
/// same row order.
struct ClusterInputs {
    points: Array2<f32>,
    scatter: Vec<[f32; 2]>,
    ids: Vec<String>,
}

/// `(attribute-name, level)` pairs for the non-zero emphasis axes.
///
/// Iteration order is the map's key order (`BTreeMap` iterates sorted), so the
/// orthonormalisation in [`build_cluster_features`] is deterministic. Levels are
/// clamped to the UI's `-4..=4` range so a hand-edited `config.json` cannot blow
/// up the `2^level` weighting.
fn active_emphasis(emphasis: &BTreeMap<String, i8>) -> Vec<(String, i8)> {
    emphasis
        .iter()
        .filter(|(_, &level)| level != 0)
        .map(|(name, &level)| (name.clone(), level.clamp(-4, 4)))
        .collect()
}

/// Builds the feature matrix fed to clustering, honouring attribute emphasis.
///
/// Without emphasis (the default) this reproduces the historical pipeline:
/// reduce the embeddings to `dimensions` principal components (or pass them
/// through when there are too few samples/features to reduce).
///
/// With one or more non-zero emphasis levels, each emphasised attribute
/// direction is made an **explicit clustering axis** instead of being reweighted
/// inside the embedding (where PCA can rotate it away). Concretely:
/// 1. the active attribute directions are orthonormalised (Gram-Schmidt) into a
///    basis `Q`, so overlapping attributes (e.g. serif/cursive) are not
///    double-counted;
/// 2. every embedding is split into its attribute coordinates `C = X Qᵀ` and the
///    residual `X - C Q` (the geometry with those attributes removed);
/// 3. the residual is PCA-reduced to `dimensions` — the model's own structure,
///    minus the controlled attributes;
/// 4. each attribute coordinate is **standardised** and appended as its own axis
///    scaled by `reference * 2^level`, where `reference` is the *typical* base
///    axis spread (mean of the base columns' stds).
///
/// The reference scaling is what makes the level a meaningful knob: the raw
/// `x·q` coordinate is ~10× narrower than a base axis (measured on this model),
/// so scaling only by `2^level` leaves the axis imperceptible across the whole
/// `-4..=4` range. Anchoring level `0` to a typical visual axis makes `±1–2` a
/// nudge that shifts grouping without unbalancing the tree, `±3–4` dominate, and
/// negatives shrink the attribute toward zero (fonts group as if it were
/// ignored). The appended columns survive into the distance metric untouched by
/// PCA. A missing or malformed `attribute_directions.json` logs a warning and
/// falls back to the no-emphasis pipeline, so clustering never fails on account
/// of emphasis.
fn build_cluster_features(
    data: Array2<f32>,
    dimensions: usize,
    emphasis: &BTreeMap<String, i8>,
) -> Result<Array2<f32>> {
    let (n_samples, n_features) = data.dim();
    let reduce = |data: Array2<f32>| -> Result<Array2<f32>> {
        if n_samples < 2 || n_features <= dimensions {
            Ok(data)
        } else {
            pca_embedding(data, dimensions)
        }
    };

    let active = active_emphasis(emphasis);
    if active.is_empty() || n_samples < 2 {
        return reduce(data);
    }

    let directions = match load_attribute_directions(n_features) {
        Ok(directions) => directions,
        Err(e) => {
            println!("⚠️ Clusterer: attribute emphasis skipped: {e}");
            return reduce(data);
        }
    };

    // Keep only attributes the asset actually carries, preserving their levels.
    let (vectors, levels): (Vec<Vec<f32>>, Vec<i8>) = active
        .iter()
        .filter_map(|(name, level)| match directions.get(name) {
            Some(direction) => Some((direction.clone(), *level)),
            None => {
                println!("⚠️ Clusterer: no direction for attribute '{name}', skipped");
                None
            }
        })
        .unzip();
    if vectors.is_empty() {
        return reduce(data);
    }

    // Q: orthonormal rows spanning the emphasised attribute subspace.
    let basis = orthonormal_basis(&vectors);
    // C = X Qᵀ (per-font attribute coordinates); residual removes that subspace.
    let coords = data.dot(&basis.t());
    let residual = &data - &coords.dot(&basis);

    let base = reduce(residual)?;

    // Reference scale = the *typical* base-axis spread (mean of the base columns'
    // stds). Anchoring to the strongest axis (PC1) instead makes even level 1
    // outweigh the whole visual base, collapsing the cloud onto one axis and
    // skewing the dendrogram (measured: PC1-ref level 1 pushed 39% of merges to
    // the low-height end vs 18% baseline). The mean keeps level ±1–2 a nudge that
    // shifts grouping without breaking the tree, while ±3–4 still dominate.
    let reference = ((0..base.ncols())
        .map(|column| column_std(&base, column))
        .sum::<f32>()
        / base.ncols().max(1) as f32)
        .max(1e-6);

    // Append each attribute coordinate as its own axis: standardise to unit
    // variance, then weight by `reference * 2^level` so the level reads as
    // "strength relative to the model's strongest visual axis".
    let mut attribute_axes = coords;
    for (column, level) in levels.iter().enumerate() {
        let mean = attribute_axes.column(column).mean().unwrap_or(0.0);
        let std = column_std(&attribute_axes, column).max(1e-6);
        let scale = reference * 2f32.powi(i32::from(*level)) / std;
        attribute_axes
            .column_mut(column)
            .mapv_inplace(|value| (value - mean) * scale);
    }

    concatenate(Axis(1), &[base.view(), attribute_axes.view()])
        .map_err(|e| AppError::Processing(e.to_string()))
}

/// Projects the clustering feature matrix to the per-font 2-D scatter
/// coordinate ([`crate::config::ClusteringData::two`]).
///
/// Takes the top two principal components of the same emphasis-aware feature
/// matrix the clustering runs on, so the scatter is a rank-2 linear view of the
/// clustered geometry and attribute emphasis carries over: levels ±1–2 tilt the
/// projection, ±3–4 give the attribute enough variance to become effectively an
/// axis of the plot. The two components are then **rotated**
/// ([`rotate_scatter_2d`]) by the configured factor rotation
/// ([`SCATTER_ROTATION`]) — varimax (orthogonal: only reorients the cloud) or
/// promax (oblique: shears it) — which the standardisation below renders as an
/// axis-aligned or tilted layout. Each output axis is standardised
/// to zero mean / unit variance so the frontend's outlier compression sees a
/// stable scale regardless of model or emphasis magnitude. Degenerate inputs (a
/// lone sample, fewer than three features) skip PCA and standardise the columns
/// that exist; a missing or constant axis reads 0.
fn scatter_projection(points: &Array2<f32>) -> Result<Vec<[f32; 2]>> {
    let (n_samples, n_features) = points.dim();
    let projected = if n_samples >= 2 && n_features > 2 {
        let (scores, components) = pca_fit(points.clone(), 2)?;
        rotate_scatter_2d(scores, &components)
    } else {
        points.clone()
    };

    let mut scatter = vec![[0.0f32; 2]; n_samples];
    for column in 0..projected.ncols().min(2) {
        let mean = projected.column(column).mean().unwrap_or(0.0);
        let std = column_std(&projected, column).max(1e-6);
        for (row, value) in projected.column(column).iter().enumerate() {
            scatter[row][column] = (value - mean) / std;
        }
    }
    Ok(scatter)
}

/// Power (κ) the varimax loadings are raised to when building the promax
/// target. 4 is the classical Hendrickson–White default (as in R's
/// `stats::promax` and statsmodels); larger values make the factors more
/// oblique.
const PROMAX_POWER: i32 = 4;

/// Factor rotation the scatter projection applies to the 2-D PCA scores.
///
/// The two share the varimax step; promax only adds an oblique relaxation on
/// top, so switching is a single edit to [`SCATTER_ROTATION`]:
/// - [`ScatterRotation::Varimax`] — orthogonal, distance-preserving (only
///   reorients the cloud);
/// - [`ScatterRotation::Promax`] — varimax then oblique (shears the cloud).
#[allow(dead_code)] // the unselected variant is "unused" until SCATTER_ROTATION is flipped
#[derive(Clone, Copy, PartialEq, Eq)]
enum ScatterRotation {
    Varimax,
    Promax,
}

/// The rotation [`rotate_scatter_2d`] uses. Flip this to compare the two looks.
const SCATTER_ROTATION: ScatterRotation = ScatterRotation::Varimax;

/// Rotates the 2-D PCA `scores` for the scatter using the configured
/// [`SCATTER_ROTATION`]; see [`rotate_scatter_2d_with`] for the mechanics.
fn rotate_scatter_2d(scores: Array2<f32>, components: &Array2<f32>) -> Array2<f32> {
    rotate_scatter_2d_with(scores, components, SCATTER_ROTATION)
}

/// Applies a two-factor **varimax** or **promax** rotation to PCA `scores`
/// (`[n, 2]`) using the fitted `components` (`[2, p]`), returning the rotated
/// scores.
///
/// Both start from the orthogonal varimax solution (loadings and scores rotated
/// by the closed-form Kaiser angle, see [`varimax_angle_2d`]).
/// [`ScatterRotation::Varimax`] stops there — distance-preserving, so the
/// scatter only reorients. [`ScatterRotation::Promax`] continues with the
/// standard oblique step (R `stats::promax`, statsmodels
/// `factor_rotation.promax`): least-squares fit the varimax loadings `A` toward a
/// sharpened target `Q = sign(A)·|A|^κ` ([`PROMAX_POWER`]) — `U = (AᵀA)⁻¹ AᵀQ` —
/// letting the two axes correlate, then the oblique scores that keep
/// `Xc ≈ F·Λᵀ` are `F = S_v·(U⁻¹)ᵀ`. That shears the cloud, which after
/// [`scatter_projection`]'s per-axis standardisation reads as a tilted layout.
/// (The reference's column normalisation of `U` is skipped: it only rescales
/// each axis, which that standardisation already discards.)
///
/// Returns `scores` unchanged for non-`k = 2` shapes or a degenerate (singular)
/// promax fit.
fn rotate_scatter_2d_with(
    scores: Array2<f32>,
    components: &Array2<f32>,
    mode: ScatterRotation,
) -> Array2<f32> {
    if scores.ncols() != 2 || components.nrows() != 2 || components.ncols() == 0 {
        return scores;
    }

    // Shared varimax step: rotate loadings and scores by the same φ.
    let loadings = components.t();
    let (sin, cos) = varimax_angle_2d(loadings).sin_cos();
    let rotation = arr2(&[[cos, -sin], [sin, cos]]);
    let varimax_loadings = loadings.dot(&rotation); // A = L·R  (p×2)
    let varimax_scores = scores.dot(&rotation); // S_v = S·R (n×2)

    if mode == ScatterRotation::Varimax {
        return varimax_scores; // orthogonal solution, distance-preserving
    }

    // Promax oblique step: target Q = sign(A)·|A|^κ, U = (AᵀA)⁻¹ AᵀQ (2×2).
    let target = varimax_loadings.mapv(|value| value.signum() * value.abs().powi(PROMAX_POWER));
    let at = varimax_loadings.t();
    let gram_inv = match invert_2x2(&at.dot(&varimax_loadings)) {
        Some(inverse) => inverse,
        None => return varimax_scores,
    };
    let u = gram_inv.dot(&at.dot(&target));

    // Oblique scores F = S_v·(U⁻¹)ᵀ; fall back to varimax if U is singular.
    match invert_2x2(&u) {
        Some(u_inv) => varimax_scores.dot(&u_inv.t()),
        None => varimax_scores,
    }
}

/// Varimax rotation angle (radians) for a two-column `loadings` matrix
/// (`[p, 2]`), via the closed-form Kaiser solution: rotating both the loadings
/// and the scores by this angle maximises the varimax simplicity criterion.
fn varimax_angle_2d(loadings: ArrayView2<f32>) -> f32 {
    let p = loadings.nrows() as f32;
    let (mut a, mut b, mut c, mut d) = (0.0f32, 0.0, 0.0, 0.0);
    for row in loadings.rows() {
        let (x, y) = (row[0], row[1]);
        let u = x * x - y * y;
        let v = 2.0 * x * y;
        a += u;
        b += v;
        c += u * u - v * v;
        d += 2.0 * u * v;
    }
    // For PCA the loading columns are orthonormal, so the `/p` correction terms
    // happen to vanish; they stay in for generality.
    0.25 * (d - 2.0 * a * b / p).atan2(c - (a * a - b * b) / p)
}

/// Inverse of a 2×2 matrix, or `None` when it is (near-)singular.
fn invert_2x2(m: &Array2<f32>) -> Option<Array2<f32>> {
    let (a, b, c, d) = (m[(0, 0)], m[(0, 1)], m[(1, 0)], m[(1, 1)]);
    let det = a * d - b * c;
    if det.abs() < 1e-12 {
        return None;
    }
    let inv_det = 1.0 / det;
    Some(arr2(&[
        [d * inv_det, -b * inv_det],
        [-c * inv_det, a * inv_det],
    ]))
}

/// Population standard deviation of one column of `data` (`0.0` when empty).
fn column_std(data: &Array2<f32>, column: usize) -> f32 {
    let column = data.column(column);
    let n = column.len();
    if n == 0 {
        return 0.0;
    }
    let mean = column.sum() / n as f32;
    (column
        .iter()
        .map(|value| (value - mean).powi(2))
        .sum::<f32>()
        / n as f32)
        .sqrt()
}

/// Orthonormalises `vectors` (modified Gram-Schmidt) into a `(k, dim)` matrix
/// whose rows are mutually orthogonal unit vectors, in input order.
///
/// A vector that is linearly dependent on the ones before it collapses to a
/// zero row, so its later attribute axis contributes nothing rather than
/// double-counting a shared direction.
fn orthonormal_basis(vectors: &[Vec<f32>]) -> Array2<f32> {
    let dim = vectors[0].len();
    let mut basis: Vec<Array1<f32>> = Vec::with_capacity(vectors.len());
    for vector in vectors {
        let mut residual = Array1::from(vector.clone());
        for previous in &basis {
            let projection = residual.dot(previous);
            residual = &residual - &(previous * projection);
        }
        let norm = residual.dot(&residual).sqrt();
        if norm > 1e-6 {
            residual /= norm;
        } else {
            residual.fill(0.0);
        }
        basis.push(residual);
    }

    let mut matrix = Array2::zeros((basis.len(), dim));
    for (row, vector) in basis.iter().enumerate() {
        matrix.row_mut(row).assign(vector);
    }
    matrix
}

/// Loads `attribute_directions.json` from the model directory as
/// `name -> direction vector`, validating the dimensionality.
///
/// The asset is model-coupled and lives beside `model.onnx`; regenerate it with
/// `distill/export_attribute_directions.py` whenever the deployed model changes.
fn load_attribute_directions(expected_dim: usize) -> Result<HashMap<String, Vec<f32>>> {
    #[derive(serde::Deserialize)]
    struct DirectionsFile {
        dim: usize,
        attributes: HashMap<String, DirectionEntry>,
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
    Ok(pca_fit(data, dimensions)?.0)
}

/// Fits a `dimensions`-component PCA, returning both the `(n_samples, k)` scores
/// and the `(k, n_features)` component matrix (its transpose is the loadings).
///
/// `dimensions` is clamped to the rank limit (`min(n_samples, n_features)`).
/// Errors when there are too few samples or features for PCA to be defined.
fn pca_fit(data: Array2<f32>, dimensions: usize) -> Result<(Array2<f32>, Array2<f32>)> {
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

    // petal's SVD asserts a C-contiguous (standard layout) input, but not
    // every caller provides one: `concatenate(Axis(1), ..)` (the emphasis
    // feature matrix) builds its result by appending columns, which leaves it
    // F-ordered. Normalise the layout before fitting.
    let data = if data.is_standard_layout() {
        data
    } else {
        data.as_standard_layout().to_owned()
    };

    let mut pca = PcaBuilder::new(dimensions).build();
    let scores = pca
        .fit_transform(&data)
        .map_err(|e| AppError::Processing(e.to_string()))?;
    Ok((scores, pca.components().to_owned()))
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

    // `kodama` uses the condensed matrix as mutable workspace. Keep the
    // original normalized leaf distances for the post-linkage leaf ordering.
    let leaf_distances = condensed;
    let mut linkage_distances = leaf_distances.clone();
    let dendrogram = linkage(&mut linkage_distances, n, kodama_method(config.method));
    drop(linkage_distances);
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
    optimize_leaf_order(&mut merges, &leaf_distances, n);
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

    let color_indices = assign_color_indices(&active_clusters, &merges, n);

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
/// The palette's adjacency contract follows the radial-tree graph mode: leaves
/// sit on a ring in left-first pre-order of the merge tree, so every cluster
/// occupies one contiguous arc and two clusters are visually adjacent exactly
/// when their arcs are consecutive on the ring (cyclically — the first and last
/// arc touch at the seam). Walking the tree with the same traversal order as
/// that mode yields the ring order. Other graph modes reuse these stable slots
/// without changing the clustering result.
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
    merges: &[DendrogramMerge],
    leaf_count: usize,
) -> Vec<usize> {
    let node_count = leaf_count + merges.len();
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
        let merge = &merges[node - leaf_count];
        stack.push(merge.right);
        stack.push(merge.left);
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

    #[test]
    fn cluster_colors_follow_the_final_oriented_ring_order() {
        let leaf_count = 10;
        let active_clusters = (0..leaf_count)
            .map(|leaf| (leaf, vec![leaf]))
            .collect::<Vec<_>>();
        let children = [
            (0, 8),
            (10, 1),
            (11, 9),
            (12, 2),
            (13, 3),
            (14, 4),
            (15, 5),
            (16, 6),
            (17, 7),
        ];
        let merges = children
            .map(|(left, right)| DendrogramMerge {
                left,
                right,
                height: 0.0,
                representative: 0,
            })
            .to_vec();
        let ring_order = [0, 8, 1, 9, 2, 3, 4, 5, 6, 7];

        let colors = assign_color_indices(&active_clusters, &merges, leaf_count);

        for rank in 0..ring_order.len() {
            assert_ne!(
                colors[ring_order[rank]],
                colors[ring_order[(rank + 1) % ring_order.len()]]
            );
        }
    }

    /// With no emphasis the feature builder must reproduce the plain PCA path
    /// exactly, so existing sessions cluster identically.
    #[test]
    fn features_without_emphasis_match_pca() {
        let data = Array2::from_shape_vec(
            (4, 6),
            vec![
                1.0, 0.0, 0.2, 0.9, 0.1, 0.4, //
                0.0, 1.0, 0.8, 0.1, 0.7, 0.3, //
                0.5, 0.5, 0.1, 0.6, 0.2, 0.9, //
                0.9, 0.2, 0.4, 0.3, 0.8, 0.1, //
            ],
        )
        .unwrap();
        let out = build_cluster_features(data.clone(), 3, &BTreeMap::new()).unwrap();
        let expected = pca_embedding(data, 3).unwrap();
        assert_eq!(out, expected);
    }

    /// Both scatter axes come out standardised: zero mean, unit variance.
    #[test]
    fn scatter_projection_standardises_axes() {
        let data = Array2::from_shape_vec(
            (6, 4),
            vec![
                1.0, 0.2, 0.5, 0.9, //
                0.1, 0.8, 0.3, 0.2, //
                0.7, 0.4, 0.9, 0.1, //
                0.3, 0.6, 0.2, 0.8, //
                0.9, 0.1, 0.7, 0.4, //
                0.2, 0.9, 0.4, 0.6, //
            ],
        )
        .unwrap();
        let scatter = scatter_projection(&data).unwrap();
        assert_eq!(scatter.len(), 6);
        for axis in 0..2 {
            let mean = scatter.iter().map(|p| p[axis]).sum::<f32>() / 6.0;
            let variance = scatter
                .iter()
                .map(|p| (p[axis] - mean).powi(2))
                .sum::<f32>()
                / 6.0;
            assert!(mean.abs() < 1e-4, "axis {axis} mean {mean}");
            assert!(
                (variance - 1.0).abs() < 1e-3,
                "axis {axis} variance {variance}"
            );
        }
    }

    /// The emphasis path's feature matrix comes out of `concatenate(Axis(1), ..)`
    /// F-ordered, and petal's SVD asserts standard layout — the projection must
    /// normalise the layout instead of panicking (regression: `is_standard_layout`
    /// assertion failure on emphasised sessions).
    #[test]
    fn scatter_projection_accepts_f_order_features() {
        let base =
            Array2::from_shape_vec((5, 2), (0..10).map(|value| value as f32 * 0.13).collect())
                .unwrap();
        let extra = Array2::from_shape_vec(
            (5, 2),
            (0..10).map(|value| ((value * 7) % 5) as f32).collect(),
        )
        .unwrap();
        let data = concatenate(Axis(1), &[base.view(), extra.view()]).unwrap();
        assert!(
            !data.is_standard_layout(),
            "concatenate along Axis(1) is expected to reproduce the F-order input"
        );

        let scatter = scatter_projection(&data).unwrap();
        assert_eq!(scatter.len(), 5);
        assert!(scatter
            .iter()
            .all(|point| point.iter().all(|value| value.is_finite())));
    }

    /// A single-feature matrix skips PCA: the lone column standardises into x
    /// and the missing y axis reads zero.
    #[test]
    fn scatter_projection_handles_single_feature() {
        let data = Array2::from_shape_vec((3, 1), vec![1.0, 2.0, 3.0]).unwrap();
        let scatter = scatter_projection(&data).unwrap();
        assert!(scatter.iter().all(|p| p[1] == 0.0));
        let mean = scatter.iter().map(|p| p[0]).sum::<f32>() / 3.0;
        assert!(mean.abs() < 1e-5);
        assert!(scatter[0][0] < scatter[1][0] && scatter[1][0] < scatter[2][0]);
    }

    /// Varimax mode is orthogonal: 45° loadings force a non-zero rotation, yet
    /// every pairwise score distance survives (only the axes reorient).
    #[test]
    fn varimax_mode_rotates_but_preserves_distances() {
        let scores =
            Array2::from_shape_vec((4, 2), vec![1.0, 0.0, 0.0, 1.0, -1.0, 0.5, 0.3, -0.7]).unwrap();
        // Loadings (componentsᵀ rows) sit at 45° ⇒ a ~45° varimax rotation.
        let components =
            Array2::from_shape_vec((2, 3), vec![0.5, 0.5, 0.7071, 0.5, 0.5, -0.7071]).unwrap();
        let out = rotate_scatter_2d_with(scores.clone(), &components, ScatterRotation::Varimax);

        assert!(
            (&out - &scores).iter().any(|value| value.abs() > 1e-3),
            "varimax should reorient the scores"
        );
        for i in 0..scores.nrows() {
            for j in (i + 1)..scores.nrows() {
                let before = &scores.row(i) - &scores.row(j);
                let after = &out.row(i) - &out.row(j);
                assert!(
                    (before.dot(&before) - after.dot(&after)).abs() < 1e-3,
                    "distance {i},{j} changed under orthogonal rotation"
                );
            }
        }
    }

    /// Promax mode is oblique: it shears the scores, so at least one pairwise
    /// distance changes — the property that distinguishes it from varimax.
    #[test]
    fn promax_mode_shears_scores() {
        let scores =
            Array2::from_shape_vec((4, 2), vec![1.0, 0.0, 0.0, 1.0, -1.0, 0.5, 0.3, -0.7]).unwrap();
        // Non-orthogonal loadings (columns correlate) ⇒ a non-trivial oblique fit.
        let components =
            Array2::from_shape_vec((2, 3), vec![0.8, 0.6, 0.0, 0.0, 0.6, 0.8]).unwrap();
        let out = rotate_scatter_2d_with(scores.clone(), &components, ScatterRotation::Promax);

        let changed = (0..scores.nrows()).any(|i| {
            ((i + 1)..scores.nrows()).any(|j| {
                let before = &scores.row(i) - &scores.row(j);
                let after = &out.row(i) - &out.row(j);
                (before.dot(&before) - after.dot(&after)).abs() > 1e-2
            })
        });
        assert!(changed, "oblique rotation must alter some distances");
    }

    /// Axis-aligned orthonormal loadings are already maximally simple, so both
    /// modes are identities and the scores pass through unchanged.
    #[test]
    fn rotation_noop_on_aligned_loadings() {
        let scores = Array2::from_shape_vec((3, 2), vec![1.0, 2.0, 3.0, 4.0, 5.0, 6.0]).unwrap();
        let components =
            Array2::from_shape_vec((2, 3), vec![1.0, 0.0, 0.0, 0.0, 1.0, 0.0]).unwrap();
        for mode in [ScatterRotation::Varimax, ScatterRotation::Promax] {
            let out = rotate_scatter_2d_with(scores.clone(), &components, mode);
            assert!(
                (&out - &scores).iter().all(|value| value.abs() < 1e-5),
                "aligned loadings should not move"
            );
        }
    }

    /// Gram-Schmidt yields mutually orthogonal unit rows and collapses a
    /// dependent input to a zero row (so it cannot double-count a direction).
    #[test]
    fn orthonormal_basis_orthogonalises_and_drops_dependents() {
        let basis = orthonormal_basis(&[
            vec![2.0, 0.0, 0.0],
            vec![1.0, 3.0, 0.0], // becomes the y axis
            vec![4.0, 0.0, 0.0], // dependent on the first → zero row
        ]);
        // rows 0 and 1 are unit norm; row 2 collapsed.
        assert!((basis.row(0).dot(&basis.row(0)).sqrt() - 1.0).abs() < 1e-5);
        assert!((basis.row(1).dot(&basis.row(1)).sqrt() - 1.0).abs() < 1e-5);
        assert!(basis.row(2).dot(&basis.row(2)) < 1e-9);
        // and the two surviving rows are orthogonal.
        assert!(basis.row(0).dot(&basis.row(1)).abs() < 1e-5);
    }

    /// A non-zero level appends exactly one standardised attribute axis whose
    /// scale is `reference * 2^level`. The reference and standardisation are
    /// identical across levels, so the appended column is zero-mean and a
    /// level `+2` axis is exactly `2×` a level `+1` axis, elementwise. Uses the
    /// on-disk asset; skips when `models/` is not present (CI).
    #[test]
    fn emphasis_appends_standardised_scaled_attribute_axis() {
        if load_attribute_directions(512).is_err() {
            return; // developer-local asset; skip on CI
        }

        // Eight arbitrary rows in embedding space.
        let mut values = Vec::with_capacity(8 * 512);
        for row in 0..8 {
            for col in 0..512 {
                values.push(((row * 7 + col) % 13) as f32 * 0.01 - 0.06);
            }
        }
        let data = Array2::from_shape_vec((8, 512), values).unwrap();

        let out1 =
            build_cluster_features(data.clone(), 3, &BTreeMap::from([("serif".to_string(), 1)]))
                .unwrap();
        let out2 =
            build_cluster_features(data, 3, &BTreeMap::from([("serif".to_string(), 2)])).unwrap();

        // One appended column beyond the (rank-limited) PCA base.
        assert!(out1.ncols() >= 2 && out2.ncols() == out1.ncols());
        let last = out1.ncols() - 1;

        // Appended axis is standardised → zero mean.
        let mean1: f32 = out1.column(last).sum() / out1.nrows() as f32;
        assert!(mean1.abs() < 1e-4, "appended axis should be zero-mean");

        // And level +2 is exactly 2× level +1 (same reference & standardisation).
        for row in 0..out1.nrows() {
            let a = out1[(row, last)];
            let b = out2[(row, last)];
            assert!(
                (b - 2.0 * a).abs() < 1e-3,
                "row {row}: level+2 {b} != 2 * level+1 {a}"
            );
        }
    }
}
