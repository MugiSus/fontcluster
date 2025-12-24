pub mod progress_events {
    use tauri::{AppHandle, Emitter};

    pub fn reset_progress(app: &AppHandle) {
        let _ = app.emit("progress_numerator_reset", 0);
        let _ = app.emit("progress_denominator_reset", 0);
    }

    pub fn set_progress_denominator(app: &AppHandle, den: i32) {
        let _ = app.emit("progress_denominator_set", den);
    }

    pub fn increment_progress(app: &AppHandle) {
        let _ = app.emit("progress_numerator_increment", ());
    }

    pub fn decrement_progress_denominator(app: &AppHandle) {
        let _ = app.emit("progress_denominator_decrement", ());
    }
}
