pub mod progress_events {
    use crate::config::ProgressStage;
    use crate::core::{AppState, EventSink};

    pub fn reset_progress(events: &impl EventSink, state: &AppState, stage: ProgressStage) {
        let _ = state.update_progress(stage, |section| {
            section.numerator = 0;
            section.denominator = 0;
        });
        let _ = events.emit_i32("progress_numerator_reset", 0);
        let _ = events.emit_i32("progress_denominator_reset", 0);
    }

    pub fn set_progress_denominator(
        events: &impl EventSink,
        state: &AppState,
        stage: ProgressStage,
        den: i32,
    ) {
        let denominator = den.max(0) as usize;
        let _ = state.update_progress(stage, |section| {
            section.denominator = denominator;
            section.numerator = section.numerator.min(section.denominator);
        });
        let _ = events.emit_i32("progress_denominator_set", den);
    }

    pub fn increase_numerator(
        events: &impl EventSink,
        state: &AppState,
        stage: ProgressStage,
        delta: i32,
    ) {
        let stored_delta = delta.max(0) as usize;
        let _ = state.update_progress(stage, |section| {
            section.numerator = section
                .numerator
                .saturating_add(stored_delta)
                .min(section.denominator);
        });
        let _ = events.emit_i32("progress_numerator_increase", delta);
    }

    pub fn decrease_denominator(
        events: &impl EventSink,
        state: &AppState,
        stage: ProgressStage,
        delta: i32,
    ) {
        let stored_delta = delta.max(0) as usize;
        let _ = state.update_progress(stage, |section| {
            section.denominator = section.denominator.saturating_sub(stored_delta);
            section.numerator = section.numerator.min(section.denominator);
        });
        let _ = events.emit_i32("progress_denominator_decrease", delta);
    }
}
