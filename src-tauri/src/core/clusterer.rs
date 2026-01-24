use crate::core::session::load_font_metadata;
use crate::core::{AppState, ClusteringEngine};
use crate::error::{AppError, Result};
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

        let (points, ids) = tokio::task::spawn_blocking(move || -> Result<(Vec<Vec<f32>>, Vec<String>)> {
            let mut points = Vec::new();
            let mut ids = Vec::new();

            let mut entries: Vec<_> = fs::read_dir(&session_dir_for_first)?
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
                        if let Some(comp) = meta.computed {
                            points.push(vec![comp.vector[0], comp.vector[1]]);
                            ids.push(meta.safe_name);
                        }
                    }
                }
            }
            Ok((points, ids))
        })
        .await
        .map_err(|e| AppError::Processing(e.to_string()))??;

        if points.is_empty() {
            return Ok(());
        }

        let n_samples = points.len();
        let labels = engine.cluster(points)?;

        let session_dir_for_second = session_dir.clone();
        let n_clusters = tokio::task::spawn_blocking(move || -> Result<usize> {
            let mut max_cluster = -1;
            for (i, id) in ids.iter().enumerate() {
                let label = labels[i];
                if label > max_cluster {
                    max_cluster = label;
                }

                let mut meta = load_font_metadata(&session_dir_for_second, id)?;
                if let Some(comp) = meta.computed.as_mut() {
                    comp.k = label;
                }
                fs::write(
                    session_dir_for_second.join(id).join("meta.json"),
                    serde_json::to_string_pretty(&meta)?,
                )?;
            }
            Ok((max_cluster + 1) as usize)
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