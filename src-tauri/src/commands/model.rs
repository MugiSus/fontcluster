//! Model-catalog commands invoked by algorithm options.

use crate::core::{list_models as read_model_catalog, ModelCatalogResponse};
use crate::error::{AppError, Result};

/// Reads local availability immediately and augments it with published model
/// releases without blocking Tauri's async command thread.
#[tauri::command]
pub async fn list_models() -> Result<ModelCatalogResponse> {
    tokio::task::spawn_blocking(read_model_catalog)
        .await
        .map_err(|error| AppError::Processing(error.to_string()))
}
