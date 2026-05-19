use crate::core::{AppState, PluginFontMetadata};
use crate::error::{AppError, Result};
use chrono::{DateTime, Utc};
use tauri::State;

#[tauri::command]
pub fn send_font_to_plugin(
    state: State<AppState>,
    payload: PluginFontMetadata,
) -> Result<DateTime<Utc>> {
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
