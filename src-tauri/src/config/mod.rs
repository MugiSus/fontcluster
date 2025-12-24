use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use chrono::{DateTime, Utc};

pub const PREVIEW_TEXT: &str = "Hamburgevons";
pub const DEFAULT_FONT_SIZE: f32 = 96.0;
pub const GLYPH_PADDING: f32 = 4.0;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionConfig {
    #[serde(rename = "session_id")]
    pub id: String,
    pub preview_text: String,
    pub date: DateTime<Utc>,
    pub weights: Vec<i32>,
    #[serde(flatten)]
    pub status: ProcessingStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ProcessingStatus {
    pub has_images: bool,
    pub has_vectors: bool,
    pub has_compressed: bool,
    pub has_clusters: bool,
    #[serde(rename = "clusters_amount")]
    pub cluster_count: usize,
    #[serde(rename = "samples_amount")]
    pub sample_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FontMetadata {
    pub safe_name: String,
    pub display_name: String,
    pub family: String,
    pub weight: i32,
    pub coords: Option<[f32; 2]>,
    pub cluster: Option<i32>,
}

#[derive(Debug, Clone)]
pub struct RenderConfig {
    pub text: String,
    pub font_size: f32,
    pub output_dir: PathBuf,
}