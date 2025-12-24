use crate::error::{Result, AppError};
use crate::core::AppState;
use crate::core::session::load_font_metadata;
use linfa::prelude::*;
use linfa_clustering::GaussianMixtureModel;
use ndarray_015::{Array1, Array2};
use std::fs;

pub struct Clusterer;

impl Clusterer {
    pub async fn cluster_all(state: &AppState) -> Result<()> {
        let session_dir = state.get_session_dir()?;
        let mut points = Vec::new();
        let mut ids = Vec::new();

        for entry in fs::read_dir(&session_dir)? {
            let path = entry?.path();
            if path.is_dir() {
                if let Ok(meta) = load_font_metadata(&session_dir, path.file_name().unwrap().to_str().unwrap()) {
                    if let Some(comp) = meta.computed {
                        points.push([comp.vector[0] as f64, comp.vector[1] as f64]);
                        ids.push(meta.safe_name);
                    }
                }
            }
        }

        if points.is_empty() { return Ok(()); }

        let n = points.len();
        let data = Array2::from_shape_vec((n, 2), points.into_iter().flatten().collect())
            .map_err(|e| AppError::Processing(e.to_string()))?;

        let n_clusters = (n as f64 * 0.1).clamp(2.0, 8.0) as usize;
        let dataset = DatasetBase::from(data.clone());

        let labels = tokio::task::spawn_blocking(move || -> Result<Array1<usize>> {
            let model = GaussianMixtureModel::params(n_clusters)
                .tolerance(0.5)
                .fit(&dataset)
                .map_err(|e| AppError::Processing(format!("{:?}", e)))?;
            Ok(model.predict(&dataset))
        }).await.map_err(|e| AppError::Processing(e.to_string()))??;

        for (i, id) in ids.iter().enumerate() {
            let mut meta = load_font_metadata(&session_dir, id)?;
            if let Some(comp) = meta.computed.as_mut() {
                comp.k = labels[i] as i32;
            }
            fs::write(session_dir.join(id).join("meta.json"), serde_json::to_string_pretty(&meta)?)?;
        }

        state.update_status(|s| {
            s.has_clusters = true;
            s.cluster_count = n_clusters;
            s.sample_count = n;
        })?;

        Ok(())
    }
}