use serde::{Deserialize, Serialize};

/// Font configuration for a single font
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FontConfig {
    /// Safe name used for file system (e.g., "400_Arial")
    pub safe_name: String,
    /// Display name (e.g., "Arial")
    pub font_name: String,
    /// Font weight value (e.g., 400)
    pub weight: i32,
    /// Available weights for this font family (empty if not detected)
    pub weights: Vec<String>,
}

impl FontConfig {
    /// Create a new font configuration
    pub fn new(safe_name: String, font_name: String, weight: i32) -> Self {
        Self {
            safe_name,
            font_name,
            weight,
            weights: Vec::new(), // Start with empty weights array
        }
    }
}