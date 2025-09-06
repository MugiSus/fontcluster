use serde::{Deserialize, Serialize};

/// Computed data after processing (2D coordinates and cluster assignment)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComputedData {
    /// 2D coordinates from PaCMAP compression [x, y]
    pub vector: Vec<f32>,
    /// Cluster assignment from GMM clustering
    pub k: i32,
}

/// Font configuration for a single font
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FontConfig {
    /// Safe name used for file system (e.g., "400_Arial")
    pub safe_name: String,
    /// Display name (e.g., "Arial")
    pub font_name: String,
    /// Font family name (e.g., "Arial")
    pub family_name: String,
    /// Font weight value (e.g., 400)
    pub weight: i32,
    /// Available weights for this font family (empty if not detected)
    pub weights: Vec<String>,
    /// Computed data after processing (None until compression and clustering complete)
    pub computed: Option<ComputedData>,
}

impl FontConfig {
    /// Create a new font configuration
    pub fn new(safe_name: String, font_name: String, family_name: String, weight: i32) -> Self {
        Self {
            safe_name,
            font_name,
            family_name,
            weight,
            weights: Vec::new(), // Start with empty weights array
            computed: None, // Start without computed data
        }
    }
}