use crate::error::{Result, AppError};
use crate::core::AppState;
use crate::core::session::load_font_metadata;
use hdbscan::Hdbscan;
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
                        points.push(vec![comp.vector[0] as f32, comp.vector[1] as f32]);
                        ids.push(meta.safe_name);
                    }
                }
            }
        }

        if points.is_empty() { return Ok(()); }

        let n = points.len();
        let config = {
            let guard = state.current_session.lock().map_err(|_| AppError::Processing("Lock poisoned".into()))?;
            guard.as_ref().and_then(|s| s.algorithm.as_ref()).and_then(|a| a.hdbscan.clone()).unwrap_or_default()
        };

        let labels = tokio::task::spawn_blocking(move || -> Result<Vec<i32>> {
            let params = hdbscan::HdbscanHyperParams::builder()
                .min_cluster_size(config.min_cluster_size)
                .min_samples(config.min_samples)
                .build();
            let clusterer = Hdbscan::new(&points, params);
            let labels = clusterer.cluster()
                .map_err(|e| AppError::Processing(format!("{:?}", e)))?;
            
            Ok(labels)
        }).await.map_err(|e| AppError::Processing(e.to_string()))??;

        let mut max_cluster = -1;
        for (i, id) in ids.iter().enumerate() {
            let label = labels[i];
            if label > max_cluster {
                max_cluster = label;
            }
            
            let mut meta = load_font_metadata(&session_dir, id)?;
            if let Some(comp) = meta.computed.as_mut() {
                comp.k = label;
            }
            fs::write(session_dir.join(id).join("meta.json"), serde_json::to_string_pretty(&meta)?)?;
        }

        let n_clusters = (max_cluster + 1) as usize;

        state.update_status(|s| {
            s.process_status = crate::config::ProcessStatus::Clustered;
            s.cluster_count = n_clusters;
            s.sample_count = n;
        })?;

        Ok(())
    }
}