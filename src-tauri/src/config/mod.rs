use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::collections::HashMap;
use chrono::{DateTime, Utc};

pub const PREVIEW_TEXT: &str = "ü";
pub const DEFAULT_FONT_SIZE: f32 = 128.0;
pub const GLYPH_PADDING: f32 = 4.0;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionConfig {
    #[serde(rename = "session_id")]
    pub id: String,
    pub preview_text: String,
    pub date: DateTime<Utc>,
    pub weights: Vec<i32>,
    pub discovered_fonts: HashMap<i32, Vec<String>>,
    pub algorithm: Option<AlgorithmConfig>,
    #[serde(flatten)]
    pub status: ProcessingStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(default)]
pub struct AlgorithmConfig {
    pub image: Option<ImageConfig>,
    pub resnet: Option<ResnetConfig>,
    pub hog: Option<HogConfig>,
    pub pacmap: Option<PacmapConfig>,
    pub hdbscan: Option<HdbscanConfig>,
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
            min_cluster_size: 16,
            min_samples: 16,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct PacmapConfig {
    pub mn_phases: usize,
    pub nn_phases: usize,
    pub fp_phases: usize,
    pub learning_rate: f32,
}

impl Default for PacmapConfig {
    fn default() -> Self {
        Self {
            mn_phases: 100,
            nn_phases: 100,
            fp_phases: 100,
            learning_rate: 1.0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct HogConfig {
    pub orientations: usize,
    pub cell_side: usize,
    pub block_side: usize,
    pub block_stride: usize,
}

impl Default for HogConfig {
    fn default() -> Self {
        Self {
            orientations: 12,
            cell_side: 16,
            block_side: 2,
            block_stride: 2,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct ImageConfig {
    pub font_size: f32,
    pub padding: f32,
}

impl Default for ImageConfig {
    fn default() -> Self {
                Self {
            font_size: DEFAULT_FONT_SIZE,
            padding: GLYPH_PADDING,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ProcessStatus {
    #[default]
    Empty,
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
        format!("{}_{}", weight, family.replace(' ', "_").replace('/', "_").replace('\\', "_"))
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct ResnetConfig {
    pub padding: f32,
}

impl Default for ResnetConfig {
    fn default() -> Self {
        Self {
            padding: 16.0,
        }
    }
}

#[derive(Debug, Clone)]
pub struct RenderConfig {
    pub text: String,
    pub font_size: f32,
    pub output_dir: PathBuf,
}