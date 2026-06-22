//! Progress bookkeeping for the pipeline stages.
//!
//! Each helper does two things: it updates the persisted [`ProgressSection`]
//! (the source of truth the UI reads) and emits a matching live event. The
//! state update is what the progress bars actually reflect; the events let any
//! interested listener react in real time. All failures are intentionally
//! swallowed — progress reporting must never abort a pipeline stage.
//!
//! [`ProgressSection`]: crate::config::ProgressSection

/// Free functions for updating and broadcasting pipeline progress.
pub mod progress_events {
    use crate::config::ProgressStage;
    use crate::core::{AppState, EventSink};

    /// Resets a stage to `0/1` and announces the reset.
    pub fn reset_progress(events: &impl EventSink, state: &AppState, stage: ProgressStage) {
        let _ = state.update_progress(stage, |section| {
            section.numerator = 0;
            section.denominator = 1;
        });
        let _ = events.emit_i32("progress_numerator_reset", 0);
        let _ = events.emit_i32("progress_denominator_reset", 0);
    }

    /// Sets a stage's denominator (its total work).
    ///
    /// A non-positive `den` means "nothing to do" and snaps the stage to a
    /// complete `1/1`; otherwise the numerator is clamped to the new total.
    pub fn set_progress_denominator(
        events: &impl EventSink,
        state: &AppState,
        stage: ProgressStage,
        den: i32,
    ) {
        let _ = state.update_progress(stage, |section| {
            if den <= 0 {
                section.numerator = 1;
                section.denominator = 1;
            } else {
                section.denominator = den as usize;
                section.numerator = section.numerator.min(section.denominator);
            }
        });
        let _ = events.emit_i32("progress_denominator_set", den);
    }

    /// Advances a stage's numerator by `delta` (clamped to the denominator).
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

    /// Shrinks a stage's denominator by `delta`, e.g. when items are dropped,
    /// keeping the numerator within the new total.
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
