use crate::commands::progress::progress_events;
use crate::config::{ComputedData, PositioningData, ProgressStage};
use crate::core::session::{load_computed_data, load_font_metadata, save_computed_data};
use crate::core::{AppState, EventSink};
use crate::error::{AppError, Result};
use ndarray::Array2;
use serde::Deserialize;
use std::fs;

const POSITIONING_DIMENSIONS: usize = 2;
const PROJECTOR_JSON: &str =
    include_str!("../../models/repvit_m1.dist_in1k/repvit_preference_projector.json");
const MIN_PROJECTOR_STD: f32 = 1e-6;

pub struct Positioner;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PreferenceProjector {
    input_dim: usize,
    input_mean: Vec<f32>,
    input_std: Vec<f32>,
    weights: Vec<Vec<f32>>,
    output_mean: Vec<f32>,
    output_std: Vec<f32>,
}

impl Positioner {
    pub async fn position_all(events: &impl EventSink, state: &AppState) -> Result<()> {
        let session_dir = state.get_session_dir()?;
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

            let embedding = position_vectors(vectors)?;

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
                        rendered_text: None,
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

pub fn position_vectors(vectors: Vec<Vec<f32>>) -> Result<Array2<f32>> {
    if vectors.is_empty() {
        return Err(AppError::Processing("No vectors to position".into()));
    }

    let n_samples = vectors.len();
    let n_features = vectors[0].len();
    if vectors.iter().any(|vector| vector.len() != n_features) {
        return Err(AppError::Processing(
            "Cannot position vectors with inconsistent dimensions".into(),
        ));
    }

    let projector: PreferenceProjector = serde_json::from_str(PROJECTOR_JSON)
        .map_err(|e| AppError::Processing(format!("Failed to load preference projector: {e}")))?;
    if n_features != projector.input_dim {
        return Err(AppError::Processing(format!(
            "Preference projector expects {} features, got {}",
            projector.input_dim, n_features
        )));
    }
    if projector.input_mean.len() != n_features
        || projector.input_std.len() != n_features
        || projector.weights.len() != POSITIONING_DIMENSIONS
        || projector
            .weights
            .iter()
            .any(|weights| weights.len() != n_features)
        || projector.output_mean.len() != POSITIONING_DIMENSIONS
        || projector.output_std.len() != POSITIONING_DIMENSIONS
    {
        return Err(AppError::Processing(
            "Preference projector parameter dimensions are invalid".into(),
        ));
    }

    let mut embedding = Array2::zeros((n_samples, POSITIONING_DIMENSIONS));
    for (index, vector) in vectors.iter().enumerate() {
        let standardized = vector
            .iter()
            .enumerate()
            .map(|(feature, value)| {
                (value - projector.input_mean[feature])
                    / projector.input_std[feature].max(MIN_PROJECTOR_STD)
            })
            .collect::<Vec<_>>();

        for axis in 0..POSITIONING_DIMENSIONS {
            let raw = projector.weights[axis]
                .iter()
                .zip(standardized.iter())
                .map(|(weight, value)| weight * value)
                .sum::<f32>();
            embedding[[index, axis]] = (raw - projector.output_mean[axis])
                / projector.output_std[axis].max(MIN_PROJECTOR_STD);
        }
    }

    Ok(embedding)
}
