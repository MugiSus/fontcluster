use crate::core::session::load_font_metadata;
use crate::core::{AppState, EmbeddingEngine};
use crate::error::{AppError, Result};
use ndarray::Array2;
use std::fs;

pub struct Compressor;

impl Compressor {
    pub async fn compress_all(state: &AppState) -> Result<()> {
        let session_dir = state.get_session_dir()?;
        let pacmap_config = {
            let guard = state
                .current_session
                .lock()
                .map_err(|_| AppError::Processing("Lock poisoned".into()))?;
            guard
                .as_ref()
                .and_then(|s| s.algorithm.as_ref())
                .and_then(|a| a.pacmap.clone())
                .unwrap_or_default()
        };
        let engine = EmbeddingEngine::from_pacmap(pacmap_config);
        let session_dir = session_dir.clone();

        tokio::task::spawn_blocking(move || -> Result<()> {
            let mut vectors = Vec::new();
            let mut font_ids = Vec::new();

            let mut entries: Vec<_> = fs::read_dir(&session_dir)?
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
                        font_ids.push(path.file_name().unwrap().to_str().unwrap().to_string());
                    }
                }
            }

            if vectors.is_empty() {
                return Err(AppError::Processing("No vectors to compress".into()));
            }

            let n_samples = vectors.len();
            let n_features = vectors[0].len();
            let data = Array2::from_shape_vec(
                (n_samples, n_features),
                vectors.into_iter().flatten().collect(),
            )
            .map_err(|e| AppError::Processing(e.to_string()))?;

            let embedding = engine.embed(data)?;

            for (i, id) in font_ids.iter().enumerate() {
                let mut meta = load_font_metadata(&session_dir, id)?;
                let k = meta.computed.as_ref().map(|c| c.k).unwrap_or(-1);
                meta.computed = Some(crate::config::ComputedData {
                    vector: [embedding[[i, 0]], embedding[[i, 1]]],
                    k,
                });
                let font_dir = session_dir.join(id);
                fs::write(
                    font_dir.join("meta.json"),
                    serde_json::to_string_pretty(&meta)?,
                )?;
            }

            Ok(())
        })
        .await
        .map_err(|e| AppError::Processing(e.to_string()))??;

        state.update_status(|s| s.process_status = crate::config::ProcessStatus::Compressed)?;
        Ok(())
    }
}