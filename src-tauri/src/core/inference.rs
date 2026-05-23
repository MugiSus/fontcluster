use crate::config::{ClusteringConfig, ClusteringMethod};
use crate::error::{AppError, Result};
use kodama::{linkage, Method as KodamaMethod};
use ndarray::Array2;
use petal_decomposition::PcaBuilder;

pub enum EmbeddingEngine {
    Pca { dimensions: usize },
}

impl EmbeddingEngine {
    pub fn pca(dimensions: usize) -> Self {
        Self::Pca { dimensions }
    }

    pub fn embed(&self, data: Array2<f32>) -> Result<Array2<f32>> {
        match self {
            Self::Pca { dimensions } => pca_embedding(data, *dimensions),
        }
    }
}

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

pub struct ClusteringResult {
    pub labels: Vec<i32>,
    pub outlier_scores: Vec<Option<f32>>,
    pub is_outlier: Vec<bool>,
    pub cluster_count: usize,
}

pub enum ClusteringEngine {
    Agglomerative(ClusteringConfig),
}

impl ClusteringEngine {
    pub fn from_agglomerative(config: ClusteringConfig) -> Self {
        Self::Agglomerative(config)
    }

    pub fn cluster(&self, points: Array2<f32>) -> Result<ClusteringResult> {
        match self {
            Self::Agglomerative(config) => agglomerative_clustering(points, config),
        }
    }
}

fn agglomerative_clustering(
    points: Array2<f32>,
    config: &ClusteringConfig,
) -> Result<ClusteringResult> {
    let n = points.nrows();
    if n == 0 {
        return Ok(ClusteringResult {
            labels: Vec::new(),
            outlier_scores: Vec::new(),
            is_outlier: Vec::new(),
            cluster_count: 0,
        });
    }
    if n == 1 {
        return Ok(ClusteringResult {
            labels: vec![0],
            outlier_scores: vec![None],
            is_outlier: vec![false],
            cluster_count: 1,
        });
    }

    let normalized = normalize_points(&points);
    let mut condensed = Vec::with_capacity((n * (n - 1)) / 2);

    for i in 0..n {
        for j in (i + 1)..n {
            condensed.push(point_distance(&normalized, i, j));
        }
    }

    let dendrogram = linkage(&mut condensed, n, kodama_method(config.method));
    let mut active_count = n;
    let target_cluster_count = if config.target_cluster_count > 0 {
        Some(config.target_cluster_count.clamp(1, n))
    } else {
        None
    };
    let distance_threshold = if config.distance_threshold > 0.0 {
        Some(config.distance_threshold)
    } else {
        None
    };

    let mut clusters = vec![Vec::new(); (2 * n) - 1];
    let mut active = vec![false; (2 * n) - 1];
    for i in 0..n {
        clusters[i].push(i);
        active[i] = true;
    }

    for (step_index, step) in dendrogram.steps().iter().enumerate() {
        if active_count <= 1 {
            break;
        }
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
        let left_size = clusters[left].len();
        let right_size = clusters[right].len();
        let mut members = Vec::with_capacity(left_size + right_size);
        members.extend_from_slice(&clusters[left]);
        members.extend_from_slice(&clusters[right]);
        clusters[new_label] = members;
        active[left] = false;
        active[right] = false;
        active[new_label] = true;
        active_count -= 1;
    }

    let mut active_clusters = active
        .iter()
        .enumerate()
        .filter(|(_, is_active)| **is_active)
        .map(|(cluster_index, _)| clusters[cluster_index].clone())
        .collect::<Vec<_>>();
    active_clusters.sort_by_key(|members| members.iter().copied().min().unwrap_or(usize::MAX));

    let mut labels = vec![-1; n];
    for (cluster_id, members) in active_clusters.iter().enumerate() {
        for point_index in members {
            labels[*point_index] = cluster_id as i32;
        }
    }

    Ok(ClusteringResult {
        labels,
        outlier_scores: vec![None; n],
        is_outlier: vec![false; n],
        cluster_count: active_clusters.len(),
    })
}

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

    fn paired_points() -> Array2<f32> {
        Array2::from_shape_vec((4, 2), vec![0.0, 0.0, 0.0, 0.1, 1.0, 1.0, 1.0, 1.1]).unwrap()
    }

    #[test]
    fn clusters_by_distance_threshold() {
        let result = agglomerative_clustering(
            paired_points(),
            &ClusteringConfig {
                method: ClusteringMethod::Average,
                preprocessing_dimensions: 2,
                distance_threshold: 0.2,
                target_cluster_count: 0,
            },
        )
        .unwrap();

        assert_eq!(result.cluster_count, 2);
        assert_eq!(result.labels, vec![0, 0, 1, 1]);
    }

    #[test]
    fn clusters_by_target_count_without_threshold() {
        let result = agglomerative_clustering(
            paired_points(),
            &ClusteringConfig {
                method: ClusteringMethod::Average,
                preprocessing_dimensions: 2,
                distance_threshold: 0.0,
                target_cluster_count: 2,
            },
        )
        .unwrap();

        assert_eq!(result.cluster_count, 2);
        assert_eq!(result.labels, vec![0, 0, 1, 1]);
    }

    #[test]
    fn distance_threshold_limits_target_count_merging() {
        let result = agglomerative_clustering(
            paired_points(),
            &ClusteringConfig {
                method: ClusteringMethod::Average,
                preprocessing_dimensions: 2,
                distance_threshold: 0.05,
                target_cluster_count: 2,
            },
        )
        .unwrap();

        assert_eq!(result.cluster_count, 4);
        assert_eq!(result.labels, vec![0, 1, 2, 3]);
    }
}
