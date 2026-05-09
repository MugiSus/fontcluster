use crate::commands::progress::progress_events;
use crate::config::{ClusteringData, ProgressStage};
use crate::core::session::{load_computed_data, load_font_metadata, save_computed_data};
use crate::core::{AppState, ClusteringEngine, EmbeddingEngine, EventSink};
use crate::error::{AppError, Result};
use ndarray::Array2;
use std::fs;

pub struct Clusterer;

impl Clusterer {
    pub async fn cluster_all(events: &impl EventSink, state: &AppState) -> Result<()> {
        let session_dir = state.get_session_dir()?;

        let config = {
            let guard = state
                .current_session
                .lock()
                .map_err(|_| AppError::Processing("Lock poisoned".into()))?;
            guard
                .as_ref()
                .and_then(|s| s.algorithm.as_ref())
                .and_then(|a| a.clustering.clone())
                .unwrap_or_default()
        };
        let preprocessing_dimensions = config.preprocessing_dimensions;
        let engine = ClusteringEngine::from_agglomerative(config);
        let session_dir_for_first = session_dir.clone();

        let (points, ids) =
            tokio::task::spawn_blocking(move || -> Result<(Array2<f32>, Vec<String>)> {
                let mut vectors = Vec::new();
                let mut ids = Vec::new();

                let mut entries: Vec<_> = fs::read_dir(session_dir_for_first.join("samples"))?
                    .filter_map(|e| e.ok())
                    .collect();
                entries.sort_by_key(|e| e.path());

                for entry in entries {
                    let path = entry.path();
                    if path.is_dir() {
                        let bin_path = path.join("vector.bin");
                        if bin_path.exists() {
                            let bytes = fs::read(&bin_path)?;
                            let floats: Vec<f32> = bytemuck::cast_slice(&bytes).to_vec();
                            vectors.push(floats);
                            ids.push(path.file_name().unwrap().to_str().unwrap().to_string());
                        }
                    }
                }

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
                    EmbeddingEngine::pca(preprocessing_dimensions)
                        .embed(data)
                        .map_err(|e| AppError::Processing(e.to_string()))?
                };

                Ok((points, ids))
            })
            .await
            .map_err(|e| AppError::Processing(e.to_string()))??;

        if points.is_empty() {
            return Ok(());
        }

        let n_samples = points.nrows();
        let clustering = engine.cluster(points)?;

        progress_events::reset_progress(events, state, ProgressStage::Clustering);
        progress_events::set_progress_denominator(
            events,
            state,
            ProgressStage::Clustering,
            ids.len() as i32,
        );

        let session_dir_for_second = session_dir.clone();
        let events = events.clone();
        let state_clone = state.clone();
        let n_clusters =
            tokio::task::spawn_blocking(move || -> Result<usize> {
                for (i, id) in ids.iter().enumerate() {
                    let meta = load_font_metadata(&session_dir_for_second, id)?;
                    let mut computed = load_computed_data(&session_dir_for_second, id)
                        .unwrap_or_else(|_| crate::config::ComputedData {
                            positioning: None,
                            clustering: None,
                        });
                    computed.clustering = Some(ClusteringData {
                        k: clustering.labels[i],
                        outlier_score: clustering.outlier_scores.get(i).copied().flatten(),
                        is_outlier: clustering.is_outlier.get(i).copied().unwrap_or(false),
                    });
                    save_computed_data(&session_dir_for_second, &meta.safe_name, &computed)?;
                    progress_events::increase_numerator(
                        &events,
                        &state_clone,
                        ProgressStage::Clustering,
                        1,
                    );
                }
                Ok(clustering.cluster_count)
            })
            .await
            .map_err(|e| AppError::Processing(e.to_string()))??;

        state.update_status(|s| {
            s.process_status = crate::config::ProcessStatus::Clustered;
            s.clusters_amount = n_clusters;
            s.samples_amount = n_samples;
        })?;

        Ok(())
    }
}
