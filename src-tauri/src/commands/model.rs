//! Model-catalog commands invoked by algorithm options.

use crate::core::{
    ensure_model, list_models as read_model_catalog, ModelCatalogResponse, TauriEventSink,
};
use crate::error::{AppError, Result};

/// Reads local availability immediately and augments it with published model
/// releases without blocking Tauri's async command thread.
#[tauri::command]
pub async fn list_models() -> Result<ModelCatalogResponse> {
    tokio::task::spawn_blocking(read_model_catalog)
        .await
        .map_err(|error| AppError::Processing(error.to_string()))
}

/// Installs a model only after an explicit download action, independently of jobs.
#[tauri::command]
pub async fn download_model(app: tauri::AppHandle, model_id: String) -> Result<()> {
    let events = TauriEventSink::new(app);
    tokio::task::spawn_blocking(move || ensure_model(&model_id, &events).map(|_| ()))
        .await
        .map_err(|error| AppError::Processing(error.to_string()))?
}
