use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;

pub const DEFAULT_RENDERING_TEXT: &str = "A";
pub const DEFAULT_FONT_SIZE: f32 = 224.0;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionConfig {
    pub app_version: String,
    pub modified_app_version: String,
    pub session_id: String,
    pub created_at: DateTime<Utc>,
    pub modified_at: DateTime<Utc>,
    pub discovered_fonts: HashMap<i32, Vec<String>>,
    pub algorithm: AlgorithmConfig,
    pub status: ProcessingStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AlgorithmConfig {
    pub rendering: RenderingConfig,
    pub clustering: ClusteringConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RenderingConfig {
    pub text: String,
    pub weights: Vec<i32>,
    pub font_set: FontSet,
    pub font_size: f32,
}

impl Default for RenderingConfig {
    fn default() -> Self {
        Self {
            text: DEFAULT_RENDERING_TEXT.to_string(),
            weights: vec![400],
            font_set: FontSet::default(),
            font_size: DEFAULT_FONT_SIZE,
        }
    }
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
pub struct ClusteringConfig {
    pub method: ClusteringMethod,
    pub preprocessing_dimensions: usize,
    pub distance_threshold: f32,
    pub target_cluster_count: usize,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, Default, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ClusteringMethod {
    Single,
    Complete,
    #[default]
    Average,
    Weighted,
    Ward,
    Centroid,
    Median,
}

impl Default for ClusteringConfig {
    fn default() -> Self {
        Self {
            method: ClusteringMethod::Average,
            preprocessing_dimensions: 8,
            distance_threshold: 0.5,
            target_cluster_count: 0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ProcessStatus {
    #[default]
    Empty,
    Rendered,
    Analyzed,
    Positioned,
    Clustered,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ProcessingStatus {
    pub process_status: ProcessStatus,
    pub clusters_amount: usize,
    pub samples_amount: usize,
    pub progress: ProcessingProgress,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
pub struct ProcessingProgress {
    pub rendering: ProgressSection,
    pub analysis: ProgressSection,
    pub clustering: ProgressSection,
    pub position: ProgressSection,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
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
    Rendering,
    Analysis,
    Clustering,
    Position,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComputedData {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rendered_text: Option<String>,
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
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FontMetadata {
    pub source: FontSource,
    pub safe_name: String,
    pub font_name: String,
    pub family_name: String,
    pub family_names: HashMap<String, String>,
    pub preferred_family_names: HashMap<String, String>,
    pub style_name: String,
    pub style_names: HashMap<String, String>,
    pub preferred_style_names: HashMap<String, String>,
    pub publishers: HashMap<String, String>,
    pub designers: HashMap<String, String>,
    pub copyright: Option<String>,
    pub trademark: Option<String>,
    pub version: Option<String>,
    pub postscript_name: Option<String>,
    pub description: Option<String>,
    pub vendor_url: Option<String>,
    pub designer_url: Option<String>,
    pub sample_text: Option<String>,
    pub weight: i32,
    pub weights: Vec<String>,
    pub font_index: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum FontSource {
    #[default]
    System,
    GoogleFonts,
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
