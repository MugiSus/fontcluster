//! Command for re-projecting a lasso-selected subset of fonts.
//!
//! When the user lassos fonts in the graph, their stored embeddings are run
//! back through the same projector the positioning stage uses, so the
//! selection can be laid out on its own without re-running the pipeline.

use crate::config::PositioningData;
use crate::core::{position_vectors, AppState};
use crate::error::{AppError, Result};
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::fs;
use tauri::{command, State};

/// Result of [`lasso_selected_process`]: the de-duplicated selection in order,
/// plus each font's freshly computed 2-D position.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LassoSelectedProcessResult {
    pub safe_names: Vec<String>,
    pub positioning_by_safe_name: HashMap<String, PositioningData>,
}

/// Re-projects the embeddings of the selected fonts to 2-D coordinates.
///
/// Duplicate names are ignored; an empty selection yields an empty result.
/// Errors if any selected font has no stored embedding.
#[command]
#[allow(non_snake_case)]
pub async fn lasso_selected_process(
    safeNames: Vec<String>,
    state: State<'_, AppState>,
) -> Result<LassoSelectedProcessResult> {
    let session_dir = state.get_session_dir()?;

    tokio::task::spawn_blocking(move || {
        let mut seen = HashSet::new();
        let mut selected_safe_names = Vec::new();
        let mut vectors = Vec::new();

        for safe_name in safeNames {
            validate_safe_name(&safe_name)?;
            if !seen.insert(safe_name.clone()) {
                continue;
            }

            let vector_path = session_dir
                .join("samples")
                .join(&safe_name)
                .join("vector.bin");
            if !vector_path.exists() {
                return Err(AppError::Processing(format!(
                    "Missing vector for selected font: {}",
                    safe_name
                )));
            }

            let bytes = fs::read(&vector_path).map_err(|error| {
                AppError::Io(format!(
                    "Failed to read selected vector {}: {}",
                    vector_path.display(),
                    error
                ))
            })?;
            let vector: Vec<f32> = bytemuck::cast_slice(&bytes).to_vec();

            selected_safe_names.push(safe_name);
            vectors.push(vector);
        }

        if selected_safe_names.is_empty() {
            return Ok(LassoSelectedProcessResult {
                safe_names: Vec::new(),
                positioning_by_safe_name: HashMap::new(),
            });
        }

        let positions = position_vectors(vectors)?;
        let mut positioning_by_safe_name = HashMap::with_capacity(selected_safe_names.len());

        for (index, safe_name) in selected_safe_names.iter().enumerate() {
            positioning_by_safe_name.insert(
                safe_name.clone(),
                PositioningData {
                    position: [positions[[index, 0]], positions[[index, 1]]],
                },
            );
        }

        Ok(LassoSelectedProcessResult {
            safe_names: selected_safe_names,
            positioning_by_safe_name,
        })
    })
    .await
    .map_err(|error| AppError::Processing(error.to_string()))?
}

/// Rejects names that could escape the samples directory (empty, `.`/`..`, or
/// containing a path separator), guarding the path join against traversal.
fn validate_safe_name(safe_name: &str) -> Result<()> {
    if safe_name.is_empty()
        || safe_name == "."
        || safe_name == ".."
        || safe_name.contains('/')
        || safe_name.contains('\\')
    {
        return Err(AppError::Processing(format!(
            "Invalid selected font safe_name: {}",
            safe_name
        )));
    }
    Ok(())
}
