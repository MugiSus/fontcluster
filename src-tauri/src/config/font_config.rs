use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Font configuration for a single font family
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FontConfig {
    /// Safe name used for file system (e.g., "Arial_Regular")
    pub safe_name: String,
    /// Display name shown to users (e.g., "Arial Regular") 
    pub display_name: String,
    /// Font family name (e.g., "Arial")
    pub family_name: String,
    /// Available weights for this font family
    pub weights: Vec<String>,
}

/// Root configuration containing all fonts
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FontsConfig {
    /// Map of safe_name to font configuration
    pub fonts: HashMap<String, FontConfig>,
}

impl FontsConfig {
    /// Create a new empty fonts configuration
    pub fn new() -> Self {
        Self {
            fonts: HashMap::new(),
        }
    }
    
    /// Add a font configuration
    pub fn add_font(&mut self, config: FontConfig) {
        self.fonts.insert(config.safe_name.clone(), config);
    }
    
    /// Get font configuration by safe name
    pub fn get_font(&self, safe_name: &str) -> Option<&FontConfig> {
        self.fonts.get(safe_name)
    }
    
    /// Get display name from safe name
    pub fn get_display_name(&self, safe_name: &str) -> Option<&str> {
        self.fonts.get(safe_name).map(|config| config.display_name.as_str())
    }
    
    /// Get all font configurations
    pub fn get_all_fonts(&self) -> Vec<&FontConfig> {
        self.fonts.values().collect()
    }
}

impl Default for FontsConfig {
    fn default() -> Self {
        Self::new()
    }
}