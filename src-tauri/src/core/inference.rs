//! Wire contract for the job's WebAssembly inference adapter.
//!
//! The child owns preprocessing and persisted vectors. The parent owns one
//! pending reply per job; the webview Worker owns only its inference session.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::mpsc::SyncSender;

pub const INFERENCE_BATCH_SIZE: usize = 8;
pub const EMBEDDING_DIMENSIONS: usize = 512;

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InferenceRequest {
    pub model_path: PathBuf,
    pub input: Vec<f32>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(tag = "status", content = "value", rename_all = "snake_case")]
pub enum InferenceReply {
    Success(Vec<f32>),
    Error(String),
}

pub struct PendingInference {
    pub request_id: u64,
    pub sender: SyncSender<InferenceReply>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InferenceMessage {
    pub run_id: String,
    pub request_id: u64,
    #[serde(flatten)]
    pub request: InferenceRequest,
}
