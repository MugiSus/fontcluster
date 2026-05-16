use crate::core::{AppState, FigmaFontPayload};
use crate::error::{AppError, Result};
use std::sync::atomic::Ordering;
use tauri::State;

#[tauri::command]
pub fn send_font_to_figma(state: State<AppState>, payload: FigmaFontPayload) -> Result<u64> {
    let sequence = state.figma_bridge_sequence.fetch_add(1, Ordering::SeqCst) + 1;
    let mut latest = state
        .figma_bridge_payload
        .lock()
        .map_err(|_| AppError::Processing("Failed to lock Figma bridge payload".to_string()))?;

    *latest = Some(payload);

    Ok(sequence)
}
