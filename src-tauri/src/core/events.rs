//! Pipeline progress/event reporting, abstracted over its destination.
//!
//! The job pipeline runs in one of two contexts: directly inside the Tauri app
//! (events go straight to the webview) or inside a spawned worker process
//! (events are written to stdout as JSON lines and forwarded by the parent,
//! see [`crate::commands::jobs`]). [`EventSink`] hides that difference so the
//! pipeline code stays identical in both cases.

use crate::error::{AppError, Result};
use serde::Serialize;
use serde_json::{json, Value};
use std::io::Write;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};

/// [`EventSink`] that delivers events to the Tauri webview.
#[derive(Clone)]
pub struct TauriEventSink {
    app: AppHandle,
}

impl TauriEventSink {
    pub fn new(app: AppHandle) -> Self {
        Self { app }
    }
}

/// [`EventSink`] that serialises events as JSON lines on stdout.
///
/// Used by the worker process; the parent reads the lines back and re-emits
/// them to the webview. The writer is shared behind a mutex so concurrent
/// pipeline stages produce interleaved-but-intact lines.
#[derive(Clone)]
pub struct StdoutEventSink {
    writer: Arc<Mutex<std::io::Stdout>>,
}

impl StdoutEventSink {
    pub fn new() -> Self {
        Self {
            writer: Arc::new(Mutex::new(std::io::stdout())),
        }
    }
}

/// Wire format for a single event line emitted by [`StdoutEventSink`].
#[derive(Debug, Serialize)]
struct WorkerEvent<'a> {
    event: &'a str,
    payload: Value,
}

/// A destination for named pipeline events.
///
/// Implementors only need to provide [`emit_value`](EventSink::emit_value);
/// the typed helpers default to it and exist purely to keep call sites free of
/// `json!`/`Value` boilerplate. The `Clone + Send + Sync + 'static` bounds let
/// a sink be moved into the blocking tasks each stage spawns.
pub trait EventSink: Clone + Send + Sync + 'static {
    /// Emits `event` carrying an arbitrary JSON `payload`.
    fn emit_value(&self, event: &str, payload: Value) -> Result<()>;

    /// Emits `event` with no payload.
    fn emit_unit(&self, event: &str) -> Result<()> {
        self.emit_value(event, Value::Null)
    }

    /// Emits `event` carrying a single integer (used for progress deltas).
    fn emit_i32(&self, event: &str, payload: i32) -> Result<()> {
        self.emit_value(event, json!(payload))
    }

    /// Emits `event` carrying a single string (e.g. a session id).
    fn emit_string(&self, event: &str, payload: String) -> Result<()> {
        self.emit_value(event, json!(payload))
    }
}

impl EventSink for TauriEventSink {
    fn emit_value(&self, event: &str, payload: Value) -> Result<()> {
        self.app.emit(event, payload)?;
        Ok(())
    }
}

impl EventSink for StdoutEventSink {
    fn emit_value(&self, event: &str, payload: Value) -> Result<()> {
        let line = serde_json::to_string(&WorkerEvent { event, payload })?;
        let mut writer = self
            .writer
            .lock()
            .map_err(|_| AppError::Processing("Worker stdout lock poisoned".into()))?;
        writeln!(writer, "{line}")?;
        writer.flush()?;
        Ok(())
    }
}
