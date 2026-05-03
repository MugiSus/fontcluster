use crate::config::HdbscanConfig;
use crate::error::{AppError, Result};
use ndarray::Array2;
use petal_clustering::{Fit, HDbscan};
use petal_decomposition::PcaBuilder;
use petal_neighbors::distance::Euclidean;

pub enum EmbeddingEngine {
    Pca,
}

impl EmbeddingEngine {
    pub fn pca() -> Self {
        Self::Pca
    }

    pub fn embed(&self, data: Array2<f32>) -> Result<Array2<f32>> {
        match self {
            Self::Pca => pca_embedding(data),
        }
    }
}

fn pca_embedding(data: Array2<f32>) -> Result<Array2<f32>> {
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

    PcaBuilder::new(2)
        .build()
        .fit_transform(&data)
        .map_err(|e| AppError::Processing(e.to_string()))
}

pub struct ClusteringResult {
    pub labels: Vec<i32>,
    pub outlier_scores: Vec<f32>,
    pub cluster_count: usize,
}

pub enum ClusteringEngine {
    Hdbscan(HdbscanConfig),
}

impl ClusteringEngine {
    pub fn from_hdbscan(config: HdbscanConfig) -> Self {
        Self::Hdbscan(config)
    }

    pub fn cluster(&self, points: Array2<f32>) -> Result<ClusteringResult> {
        match self {
            Self::Hdbscan(config) => {
                let mut hdbscan = HDbscan {
                    alpha: 1.0,
                    min_samples: config.min_samples,
                    min_cluster_size: config.min_cluster_size,
                    metric: Euclidean::default(),
                    boruvka: true,
                };
                let (clusters, _outliers, outlier_scores) = hdbscan.fit(&points.view(), None);

                let mut labels = vec![-1; points.nrows()];
                let mut cluster_members = clusters.into_values().collect::<Vec<_>>();
                cluster_members
                    .sort_by_key(|members| members.iter().copied().min().unwrap_or(usize::MAX));

                for (cluster_id, members) in cluster_members.iter().enumerate() {
                    for point_index in members {
                        labels[*point_index] = cluster_id as i32;
                    }
                }

                Ok(ClusteringResult {
                    labels,
                    outlier_scores,
                    cluster_count: cluster_members.len(),
                })
            }
        }
    }
}
