use crate::config::{HdbscanConfig, PacmapConfig};
use crate::error::{AppError, Result};
use hdbscan::Hdbscan;
use ndarray::Array2;
use pacmap::{Configuration, fit_transform, Initialization};

pub enum EmbeddingEngine {
    Pacmap(PacmapConfig),
}

impl EmbeddingEngine {
    pub fn from_pacmap(config: PacmapConfig) -> Self {
        Self::Pacmap(config)
    }

    pub fn embed(&self, data: Array2<f32>) -> Result<Array2<f32>> {
        match self {
            Self::Pacmap(config) => pacmap_embedding(data, config),
        }
    }
}

fn pacmap_embedding(data: Array2<f32>, config: &PacmapConfig) -> Result<Array2<f32>> {
    let pacmap_config = Configuration::builder()
        .embedding_dimensions(2)
        .initialization(Initialization::Pca)
        .seed(42)
        .num_iters((config.mn_phases, config.nn_phases, config.fp_phases))
        .learning_rate(config.learning_rate)
        .build();

    let (embedding, _) = fit_transform(data.view(), pacmap_config)
        .map_err(|e| AppError::Processing(e.to_string()))?;

    Ok(embedding)
}

pub enum ClusteringEngine {
    Hdbscan(HdbscanConfig),
}

impl ClusteringEngine {
    pub fn from_hdbscan(config: HdbscanConfig) -> Self {
        Self::Hdbscan(config)
    }

    pub fn cluster(&self, points: Vec<Vec<f32>>) -> Result<Vec<i32>> {
        match self {
            Self::Hdbscan(config) => {
                let params = hdbscan::HdbscanHyperParams::builder()
                    .min_cluster_size(config.min_cluster_size)
                    .min_samples(config.min_samples)
                    .build();
                let clusterer = Hdbscan::new(&points, params);
                let labels = clusterer
                    .cluster()
                    .map_err(|e| AppError::Processing(format!("{:?}", e)))?;
                Ok(labels)
            }
        }
    }
}
