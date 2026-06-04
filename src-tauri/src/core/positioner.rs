use crate::commands::progress::progress_events;
use crate::config::{ComputedData, PositioningData, ProgressStage};
use crate::core::session::{load_computed_data, load_font_metadata, save_computed_data};
use crate::core::{AppState, EventSink};
use crate::error::{AppError, Result};
use ndarray::{Array2, ArrayView1};
use serde::Deserialize;
use std::fs;

const POSITIONING_DIMENSIONS: usize = 2;
const PROJECTOR_JSON: &str =
    include_str!("../../models/repvit_m1.dist_in1k/repvit_preference_projector.json");
const PROJECTOR_KIND: &str = "linear_pairwise_preference_projector";
const PROJECTOR_EMBEDDING_MODEL: &str = "repvit-m1.0";
const MIN_PROJECTOR_STD: f32 = 1e-6;

pub struct Positioner;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PreferenceProjector {
    version: u32,
    kind: String,
    embedding_model: String,
    input_dim: usize,
    axes: Vec<String>,
    input_mean: Vec<f32>,
    input_std: Vec<f32>,
    weights: Vec<Vec<f32>>,
    output_mean: Vec<f32>,
    output_std: Vec<f32>,
}

impl PreferenceProjector {
    fn validate(&self) -> Result<()> {
        if self.version != 1 {
            return Err(AppError::Processing(format!(
                "Unsupported preference projector version: {}",
                self.version
            )));
        }
        if self.kind != PROJECTOR_KIND {
            return Err(AppError::Processing(format!(
                "Unsupported preference projector kind: {}",
                self.kind
            )));
        }
        if self.embedding_model != PROJECTOR_EMBEDDING_MODEL {
            return Err(AppError::Processing(format!(
                "Preference projector expects {}, got {}",
                PROJECTOR_EMBEDDING_MODEL, self.embedding_model
            )));
        }
        if self.axes.len() != POSITIONING_DIMENSIONS
            || self.axes[0] != "contrast"
            || self.axes[1] != "decorativeness"
        {
            return Err(AppError::Processing(format!(
                "Preference projector axes must be [contrast, decorativeness], got {:?}",
                self.axes
            )));
        }
        if self.input_mean.len() != self.input_dim
            || self.input_std.len() != self.input_dim
            || self.weights.len() != POSITIONING_DIMENSIONS
            || self
                .weights
                .iter()
                .any(|weights| weights.len() != self.input_dim)
            || self.output_mean.len() != POSITIONING_DIMENSIONS
            || self.output_std.len() != POSITIONING_DIMENSIONS
        {
            return Err(AppError::Processing(
                "Preference projector parameter dimensions are invalid".into(),
            ));
        }
        Ok(())
    }

    fn project(&self, vector: &[f32]) -> Result<[f32; POSITIONING_DIMENSIONS]> {
        if vector.len() != self.input_dim {
            return Err(AppError::Processing(format!(
                "Preference projector expects {} features, got {}",
                self.input_dim,
                vector.len()
            )));
        }

        let standardized = vector
            .iter()
            .enumerate()
            .map(|(index, value)| {
                (value - self.input_mean[index]) / self.input_std[index].max(MIN_PROJECTOR_STD)
            })
            .collect::<Vec<_>>();
        let standardized = ArrayView1::from(&standardized);
        let mut output = [0.0; POSITIONING_DIMENSIONS];

        for (axis, value) in output.iter_mut().enumerate() {
            let weights = ArrayView1::from(&self.weights[axis]);
            let raw = weights.dot(&standardized);
            *value = (raw - self.output_mean[axis]) / self.output_std[axis].max(MIN_PROJECTOR_STD);
        }

        Ok(output)
    }
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
    projector.validate()?;
    if n_features != projector.input_dim {
        return Err(AppError::Processing(format!(
            "Preference projector expects {} features, got {}",
            projector.input_dim, n_features
        )));
    }

    let mut embedding = Array2::zeros((n_samples, POSITIONING_DIMENSIONS));
    for (index, vector) in vectors.iter().enumerate() {
        let position = projector.project(vector)?;
        embedding[[index, 0]] = position[0];
        embedding[[index, 1]] = position[1];
    }

    Ok(embedding)
}
