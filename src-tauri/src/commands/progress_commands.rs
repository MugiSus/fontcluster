use tauri::{AppHandle, Emitter};

/// Progress tracking commands for font generation pipeline
/// 
/// These commands emit events to update the frontend progress indicators.

/// Reset progress counters to 0
#[tauri::command]
pub fn reset_progress(app_handle: AppHandle) -> Result<(), String> {
    app_handle
        .emit("progress_numerator_reset", 0)
        .map_err(|e| format!("Failed to emit reset event: {}", e))?;
    
    app_handle
        .emit("progress_denominator_reset", 0)
        .map_err(|e| format!("Failed to emit reset event: {}", e))?;
    
    Ok(())
}

/// Increment progress numerator by 1
#[tauri::command]
pub fn increment_progress(app_handle: AppHandle) -> Result<(), String> {
    app_handle
        .emit("progress_numerator_increment", ())
        .map_err(|e| format!("Failed to emit increment event: {}", e))?;
    
    Ok(())
}

/// Set progress denominator (total count)
#[tauri::command]
pub fn set_progress_denominator(app_handle: AppHandle, denominator: i32) -> Result<(), String> {
    app_handle
        .emit("progress_denominator_set", denominator)
        .map_err(|e| format!("Failed to emit denominator event: {}", e))?;
    
    Ok(())
}

/// Decrement progress denominator by 1
#[tauri::command]
pub fn decrement_progress_denominator(app_handle: AppHandle) -> Result<(), String> {
    app_handle
        .emit("progress_denominator_decrement", ())
        .map_err(|e| format!("Failed to emit denominator decrement event: {}", e))?;
    
    Ok(())
}

/// Utility functions for emitting progress events from other modules
pub mod progress_events {
    use tauri::{AppHandle, Emitter};

    pub fn reset_progress(app_handle: &AppHandle) {
        let _ = app_handle.emit("progress_numerator_reset", 0);
        let _ = app_handle.emit("progress_denominator_reset", 0);
    }

    pub fn increment_progress(app_handle: &AppHandle) {
        let _ = app_handle.emit("progress_numerator_increment", ());
    }

    pub fn set_progress_denominator(app_handle: &AppHandle, denominator: i32) {
        let _ = app_handle.emit("progress_denominator_set", denominator);
    }

    pub fn decrement_progress_denominator(app_handle: &AppHandle) {
        let _ = app_handle.emit("progress_denominator_decrement", ());
    }
}