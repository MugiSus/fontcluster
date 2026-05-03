use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;

pub const PREVIEW_TEXT: &str = "font";
pub const DEFAULT_FONT_SIZE: f32 = 128.0;
pub const GLYPH_PADDING: f32 = 4.0;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionConfig {
    pub app_version: String,
    pub modified_app_version: String,
    #[serde(rename = "session_id")]
    pub id: String,
    pub preview_text: String,
    pub created_at: DateTime<Utc>,
    pub modified_at: DateTime<Utc>,
    pub weights: Vec<i32>,
    pub discovered_fonts: HashMap<i32, Vec<String>>,
    pub algorithm: Option<AlgorithmConfig>,
    #[serde(flatten)]
    pub status: ProcessingStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(default)]
pub struct AlgorithmConfig {
    pub discovery: Option<DiscoveryConfig>,
    pub image: Option<ImageConfig>,
    pub hdbscan: Option<HdbscanConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(default)]
pub struct DiscoveryConfig {
    pub font_set: FontSet,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum FontSet {
    SystemFonts,
    GoogleFontsPopular100,
    GoogleFontsPopular200,
    GoogleFontsPopular300,
    GoogleFontsPopular500,
    GoogleFontsPopular1000,
    GoogleFontsPopular1500,
    GoogleFontsAll,
}

impl Default for FontSet {
    fn default() -> Self {
        Self::SystemFonts
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct HdbscanConfig {
    pub min_cluster_size: usize,
    pub min_samples: usize,
}

impl Default for HdbscanConfig {
    fn default() -> Self {
        Self {
            min_cluster_size: 12,
            min_samples: 12,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct ImageConfig {
    pub font_size: f32,
}

impl Default for ImageConfig {
    fn default() -> Self {
        Self {
            font_size: DEFAULT_FONT_SIZE,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ProcessStatus {
    #[default]
    Empty,
    Downloaded,
    Discovered,
    Generated,
    Vectorized,
    Compressed,
    Clustered,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(default)]
pub struct ProcessingStatus {
    pub process_status: ProcessStatus,
    #[serde(rename = "clusters_amount")]
    pub cluster_count: usize,
    #[serde(rename = "samples_amount")]
    pub sample_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComputedData {
    pub vector: [f32; 2],
    pub k: i32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub outlier_score: Option<f32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FontMetadata {
    pub safe_name: String,
    #[serde(rename = "font_name")]
    pub display_name: String,
    #[serde(rename = "family_name")]
    pub family: String,
    pub family_names: HashMap<String, String>,
    pub preferred_family_names: HashMap<String, String>,
    pub publishers: HashMap<String, String>,
    pub designers: HashMap<String, String>,
    pub weight: i32,
    pub weights: Vec<String>,
    pub path: Option<PathBuf>,
    pub font_index: u32,
    pub computed: Option<ComputedData>,
}

impl FontMetadata {
    pub fn generate_safe_name(family: &str, weight: i32) -> String {
        format!(
            "{}_{}",
            weight,
            family
                .replace(' ', "_")
                .replace('/', "_")
                .replace('\\', "_")
        )
    }
}

#[derive(Debug, Clone)]
pub struct RenderConfig {
    pub text: String,
    pub font_size: f32,
    pub output_dir: PathBuf,
}
