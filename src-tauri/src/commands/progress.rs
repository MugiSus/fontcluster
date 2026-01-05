pub mod progress_events {
    use tauri::{AppHandle, Emitter};

    pub fn reset_progress(app: &AppHandle) {
        let _ = app.emit("progress_numerator_reset", 0);
        let _ = app.emit("progress_denominator_reset", 0);
    }

    pub fn set_progress_denominator(app: &AppHandle, den: i32) {
        let _ = app.emit("progress_denominator_set", den);
    }

    pub fn increase_numerator(app: &AppHandle, delta: i32) {
        let _ = app.emit("progress_numerator_increase", delta);
    }

    pub fn decrease_denominator(app: &AppHandle, delta: i32) {
        let _ = app.emit("progress_denominator_decrease", delta);
    }
}
