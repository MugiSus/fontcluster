use crate::error::{AppError, Result};
use serde::Serialize;
use serde_json::{json, Value};
use std::io::Write;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};

#[derive(Clone)]
pub struct TauriEventSink {
    app: AppHandle,
}

impl TauriEventSink {
    pub fn new(app: AppHandle) -> Self {
        Self { app }
    }
}

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

#[derive(Debug, Serialize)]
struct WorkerEvent<'a> {
    event: &'a str,
    payload: Value,
}

pub trait EventSink: Clone + Send + Sync + 'static {
    fn emit_value(&self, event: &str, payload: Value) -> Result<()>;

    fn emit_unit(&self, event: &str) -> Result<()> {
        self.emit_value(event, Value::Null)
    }

    fn emit_i32(&self, event: &str, payload: i32) -> Result<()> {
        self.emit_value(event, json!(payload))
    }

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
