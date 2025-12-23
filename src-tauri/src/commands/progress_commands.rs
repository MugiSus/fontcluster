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

    pub fn increment_progress_by(app_handle: &AppHandle, amount: i32) {
        let _ = app_handle.emit("progress_numerator_increment_by", amount);
    }

    pub fn set_progress_denominator(app_handle: &AppHandle, denominator: i32) {
        let _ = app_handle.emit("progress_denominator_set", denominator);
    }

    pub fn decrement_progress_denominator(app_handle: &AppHandle) {
        let _ = app_handle.emit("progress_denominator_decrement", ());
    }
}