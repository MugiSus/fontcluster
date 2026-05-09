pub mod progress_events {
    use crate::core::EventSink;

    pub fn reset_progress(events: &impl EventSink) {
        let _ = events.emit_i32("progress_numerator_reset", 0);
        let _ = events.emit_i32("progress_denominator_reset", 0);
    }

    pub fn set_progress_denominator(events: &impl EventSink, den: i32) {
        let _ = events.emit_i32("progress_denominator_set", den);
    }

    pub fn increase_numerator(events: &impl EventSink, delta: i32) {
        let _ = events.emit_i32("progress_numerator_increase", delta);
    }

    pub fn decrease_denominator(events: &impl EventSink, delta: i32) {
        let _ = events.emit_i32("progress_denominator_decrease", delta);
    }
}
