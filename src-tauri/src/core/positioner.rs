use crate::commands::progress::progress_events;
use crate::config::{ComputedData, PositioningData, ProgressStage};
use crate::core::session::{load_computed_data, load_font_metadata, save_computed_data};
use crate::core::{AppState, EmbeddingEngine, EventSink};
use crate::error::{AppError, Result};
use ndarray::Array2;
use std::fs;

const POSITIONING_DIMENSIONS: usize = 2;

pub struct Positioner;

impl Positioner {
    pub async fn position_all(events: &impl EventSink, state: &AppState) -> Result<()> {
        let session_dir = state.get_session_dir()?;
        let engine = EmbeddingEngine::pca(POSITIONING_DIMENSIONS);
        let session_dir = session_dir.clone();
        let events = events.clone();
        let state_clone = state.clone();

        tokio::task::spawn_blocking(move || -> Result<()> {
            let mut vectors = Vec::new();
            let mut font_ids = Vec::new();

            let mut entries: Vec<_> = fs::read_dir(session_dir.join("samples"))?
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
                return Err(AppError::Processing("No vectors to position".into()));
            }

            let n_samples = vectors.len();
            let n_features = vectors[0].len();
            let data = Array2::from_shape_vec(
                (n_samples, n_features),
                vectors.into_iter().flatten().collect(),
            )
            .map_err(|e| AppError::Processing(e.to_string()))?;

            let embedding = if n_samples < 2 || n_features < 2 {
                Array2::zeros((n_samples, POSITIONING_DIMENSIONS))
            } else {
                engine.embed(data)?
            };

            progress_events::reset_progress(&events, &state_clone, ProgressStage::Position);
            progress_events::set_progress_denominator(
                &events,
                &state_clone,
                ProgressStage::Position,
                font_ids.len() as i32,
            );

            for (i, id) in font_ids.iter().enumerate() {
                let meta = load_font_metadata(&session_dir, id)?;
                let mut computed =
                    load_computed_data(&session_dir, id).unwrap_or_else(|_| ComputedData {
                        positioning: None,
                        clustering: None,
                    });
                computed.positioning = Some(PositioningData {
                    position: [embedding[[i, 0]], embedding[[i, 1]]],
                });
                save_computed_data(&session_dir, &meta.safe_name, &computed)?;
                progress_events::increase_numerator(
                    &events,
                    &state_clone,
                    ProgressStage::Position,
                    1,
                );
            }

            Ok(())
        })
        .await
        .map_err(|e| AppError::Processing(e.to_string()))??;

        state.update_status(|s| s.process_status = crate::config::ProcessStatus::Positioned)?;
        Ok(())
    }
}
