use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use chrono::{DateTime, Utc};

pub const PREVIEW_TEXT: &str = "Hamburgevons";
pub const DEFAULT_FONT_SIZE: f32 = 48.0;
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
pub struct ComputedData {
    pub vector: [f32; 2],
    pub k: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FontMetadata {
    pub safe_name: String,
    #[serde(rename = "font_name")]
    pub display_name: String,
    #[serde(rename = "family_name")]
    pub family: String,
    pub weight: i32,
    pub weights: Vec<String>,
    pub computed: Option<ComputedData>,
}

#[derive(Debug, Clone)]
pub struct RenderConfig {
    pub text: String,
    pub font_size: f32,
    pub output_dir: PathBuf,
}