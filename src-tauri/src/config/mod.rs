use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;

pub const PREVIEW_TEXT: &str = "font";
pub const DEFAULT_FONT_SIZE: f32 = 224.0;
pub const GLYPH_PADDING: f32 = 4.0;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionConfig {
    pub app_version: String,
    pub modified_app_version: String,
    pub session_id: String,
    pub preview_text: String,
    pub created_at: DateTime<Utc>,
    pub modified_at: DateTime<Utc>,
    pub weights: Vec<i32>,
    pub discovered_fonts: HashMap<i32, Vec<String>>,
    pub algorithm: Option<AlgorithmConfig>,
    pub status: ProcessingStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(default)]
pub struct AlgorithmConfig {
    pub discovery: Option<DiscoveryConfig>,
    pub image: Option<ImageConfig>,
    pub clustering: Option<ClusteringConfig>,
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
pub struct ClusteringConfig {
    pub preprocessing_dimensions: usize,
    pub distance_threshold: f32,
    pub target_cluster_count: usize,
}

impl Default for ClusteringConfig {
    fn default() -> Self {
        Self {
            preprocessing_dimensions: 64,
            distance_threshold: 0.4,
            target_cluster_count: 0,
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
    Clustered,
    Positioned,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(default)]
pub struct ProcessingStatus {
    pub process_status: ProcessStatus,
    pub clusters_amount: usize,
    pub samples_amount: usize,
    pub progress: ProcessingProgress,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
#[serde(default)]
pub struct ProcessingProgress {
    pub download: ProgressSection,
    pub discovery: ProgressSection,
    pub generation: ProgressSection,
    pub vectorization: ProgressSection,
    pub clustering: ProgressSection,
    pub position: ProgressSection,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(default)]
pub struct ProgressSection {
    pub numerator: usize,
    pub denominator: usize,
}

impl Default for ProgressSection {
    fn default() -> Self {
        Self {
            numerator: 0,
            denominator: 1,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ProgressStage {
    Download,
    Discovery,
    Generation,
    Vectorization,
    Clustering,
    Position,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComputedData {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub positioning: Option<PositioningData>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub clustering: Option<ClusteringData>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PositioningData {
    pub position: [f32; 2],
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClusteringData {
    pub k: i32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub outlier_score: Option<f32>,
    pub is_outlier: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FontMetadata {
    pub safe_name: String,
    pub font_name: String,
    pub family_name: String,
    pub family_names: HashMap<String, String>,
    pub preferred_family_names: HashMap<String, String>,
    pub publishers: HashMap<String, String>,
    pub designers: HashMap<String, String>,
    pub weight: i32,
    pub weights: Vec<String>,
    pub path: Option<PathBuf>,
    pub font_index: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FontData {
    pub meta: FontMetadata,
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
