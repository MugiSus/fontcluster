//! Commands bridging the UI to connected design-tool plugins.
//!
//! These read and write the shared plugin-bridge state in [`AppState`]; the
//! HTTP side that plugins actually talk to lives in
//! [`crate::core::plugin_bridge`].

use crate::config::FontMetadata;
use crate::core::{get_active_plugin_connections, AppState, PluginConnection};
use crate::error::{AppError, Result};
use chrono::{DateTime, Utc};
use serde::Serialize;
use tauri::State;

/// Response of [`get_connected_plugins`].
#[derive(Debug, Serialize)]
pub struct PluginConnectionsResponse {
    plugins: Vec<PluginConnection>,
}

/// Publishes a font for plugins to pick up, returning the change timestamp.
#[tauri::command]
pub fn send_font_to_plugin(state: State<AppState>, payload: FontMetadata) -> Result<DateTime<Utc>> {
    let modified_date = Utc::now();
    let mut font = state
        .plugin_bridge_font
        .lock()
        .map_err(|_| AppError::Processing("Failed to lock plugin bridge font".to_string()))?;
    let mut bridge_modified_date = state.plugin_bridge_modified_date.lock().map_err(|_| {
        AppError::Processing("Failed to lock plugin bridge modified date".to_string())
    })?;

    *font = Some(payload);
    *bridge_modified_date = Some(modified_date);

    Ok(modified_date)
}

/// Returns the plugins currently considered connected.
#[tauri::command]
pub fn get_connected_plugins(state: State<AppState>) -> Result<PluginConnectionsResponse> {
    Ok(PluginConnectionsResponse {
        plugins: get_active_plugin_connections(&state)?,
    })
}
