use crate::config::ClusteringData;
use crate::core::session::{load_computed_data, load_font_metadata, save_computed_data};
use crate::core::{AppState, ClusteringEngine};
use crate::error::{AppError, Result};
use ndarray::Array2;
use std::fs;

pub struct Clusterer;

impl Clusterer {
    pub async fn cluster_all(state: &AppState) -> Result<()> {
        let session_dir = state.get_session_dir()?;

        let config = {
            let guard = state
                .current_session
                .lock()
                .map_err(|_| AppError::Processing("Lock poisoned".into()))?;
            guard
                .as_ref()
                .and_then(|s| s.algorithm.as_ref())
                .and_then(|a| a.hdbscan.clone())
                .unwrap_or_default()
        };
        let engine = ClusteringEngine::from_hdbscan(config);
        let session_dir_for_first = session_dir.clone();

        let (points, ids) =
            tokio::task::spawn_blocking(move || -> Result<(Array2<f32>, Vec<String>)> {
                let mut points = Vec::new();
                let mut ids = Vec::new();

                let mut entries: Vec<_> = fs::read_dir(session_dir_for_first.join("samples"))?
                    .filter_map(|e| e.ok())
                    .collect();
                entries.sort_by_key(|e| e.path());

                for entry in entries {
                    let path = entry.path();
                    if path.is_dir() {
                        if let Ok(meta) = load_font_metadata(
                            &session_dir_for_first,
                            path.file_name().unwrap().to_str().unwrap(),
                        ) {
                            if let Ok(computed) =
                                load_computed_data(&session_dir_for_first, &meta.safe_name)
                            {
                                points.extend_from_slice(&computed.compression.position);
                                ids.push(meta.safe_name);
                            }
                        }
                    }
                }
                let points = Array2::from_shape_vec((ids.len(), 2), points)
                    .map_err(|e| AppError::Processing(e.to_string()))?;
                Ok((points, ids))
            })
            .await
            .map_err(|e| AppError::Processing(e.to_string()))??;

        if points.is_empty() {
            return Ok(());
        }

        let n_samples = points.nrows();
        let clustering = engine.cluster(points)?;

        let session_dir_for_second = session_dir.clone();
        let n_clusters = tokio::task::spawn_blocking(move || -> Result<usize> {
            for (i, id) in ids.iter().enumerate() {
                let mut computed = load_computed_data(&session_dir_for_second, id)?;
                computed.clustering = Some(ClusteringData {
                    k: clustering.labels[i],
                    outlier_score: clustering.outlier_scores.get(i).copied(),
                    is_outlier: clustering.is_outlier.get(i).copied().unwrap_or(false),
                });
                save_computed_data(&session_dir_for_second, id, &computed)?;
            }
            Ok(clustering.cluster_count)
        })
        .await
        .map_err(|e| AppError::Processing(e.to_string()))??;

        state.update_status(|s| {
            s.process_status = crate::config::ProcessStatus::Clustered;
            s.cluster_count = n_clusters;
            s.sample_count = n_samples;
        })?;

        Ok(())
    }
}
