use serde::{Deserialize, Serialize};

/// Font configuration for a single font
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FontConfig {
    /// Safe name used for file system (e.g., "Arial_Regular")
    pub safe_name: String,
    /// Display name shown to users (e.g., "Arial Regular") 
    pub display_name: String,
    /// Font family name (e.g., "Arial")
    pub family_name: String,
    /// Available weights for this font family (empty if not detected)
    pub weights: Vec<String>,
}

impl FontConfig {
    /// Create a new font configuration
    pub fn new(safe_name: String, display_name: String, family_name: String) -> Self {
        Self {
            safe_name,
            display_name,
            family_name,
            weights: Vec::new(), // Start with empty weights array
        }
    }
}