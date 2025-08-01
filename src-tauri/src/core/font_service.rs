use crate::error::FontResult;
use crate::core::SessionManager;
use font_kit::source::SystemSource;
use font_kit::family_name::FamilyName;
use font_kit::properties::{Properties, Weight};
use std::collections::HashSet;
use std::path::PathBuf;
use std::fs;

/// Represents a validated font-weight pair that is guaranteed to work
#[derive(Debug, Clone)]
pub struct FontWeightPair {
    pub family_name: String,
    pub requested_weight: i32,
    pub actual_weight: i32,
}

// Service layer for font operations
pub struct FontService;

impl FontService {
    /// Returns a list of system fonts, excluding symbol fonts and noise fonts
    pub fn get_system_fonts_with_source(source: &SystemSource) -> Vec<String> {
        source
            .all_families()
            .map(|families| {
                let mut fonts: Vec<String> = families.into_iter()
                    .map(|f| f.to_string())
                    .filter(|font_name| Self::is_regular_font(font_name))
                    .collect::<HashSet<_>>()
                    .into_iter()
                    .collect();
                fonts.sort();
                fonts
            })
            .unwrap_or_default()
    }
    
    /// Returns a list of system fonts, excluding symbol fonts and noise fonts
    pub fn get_system_fonts() -> Vec<String> {
        let source = SystemSource::new();
        Self::get_system_fonts_with_source(&source)
    }
    
    /// Returns validated font-weight pairs that are guaranteed to work
    pub fn get_validated_font_weight_pairs(source: &SystemSource, weights: &[i32]) -> Vec<FontWeightPair> {
        println!("🔍 Pre-resolving font-weight pairs for weights: {:?}", weights);
        let start_time = std::time::Instant::now();
        
        let all_families = source.all_families().unwrap_or_default();
        let total_families = all_families.len();
        println!("📊 Total font families found: {}", total_families);
        
        let mut validated_pairs = Vec::new();
        
        for family_name in all_families {
            // Skip symbol fonts first
            if !Self::is_regular_font(&family_name) {
                continue;
            }
            
            // Check each weight for this family
            for &weight_value in weights {
                if let Some(actual_weight) = Self::validate_font_weight(source, &family_name, weight_value) {
                    validated_pairs.push(FontWeightPair {
                        family_name: family_name.clone(),
                        requested_weight: weight_value,
                        actual_weight,
                    });
                }
            }
        }
        
        let elapsed = start_time.elapsed();
        println!("✅ Pre-validation completed in {:.2}ms: {} valid font-weight pairs from {} families", 
                elapsed.as_millis(), validated_pairs.len(), total_families);
        
        // Sort by family name for consistent ordering
        validated_pairs.sort_by(|a, b| a.family_name.cmp(&b.family_name));
        validated_pairs
    }
    
    /// Validate that a font family supports a specific weight and return the actual weight
    fn validate_font_weight(source: &SystemSource, family_name: &str, weight_value: i32) -> Option<i32> {
        let properties = Properties {
            weight: Weight(weight_value as f32),
            ..Default::default()
        };
        
        // Try to select and load the font
        if let Ok(handle) = source.select_best_match(
            &[FamilyName::Title(family_name.to_string())], 
            &properties
        ) {
            if let Ok(font) = handle.load() {
                let actual_weight = font.properties().weight.0 as i32;
                let weight_diff = (actual_weight - weight_value).abs();
                
                // Accept if weight difference is reasonable
                if weight_diff <= 50 {
                    return Some(actual_weight);
                }
            }
        }
        
        None
    }
    
    
    /// Filters out symbol fonts, dingbats, and other noise fonts
    fn is_regular_font(font_name: &str) -> bool {
        let font_lower = font_name.to_lowercase();
        
        // List of font patterns to exclude (minimal list to avoid excluding useful fonts)
        let excluded_patterns = [
            "wingdings",
            "webdings",
            "dingbats", 
            "emoji",
            "font awesome",
            "bodoni ornaments"
        ];
        
        // Check if font name contains any excluded patterns
        for pattern in &excluded_patterns {
            if font_lower.contains(pattern) {
                return false;
            }
        }
        
        true
    }
    
    pub fn create_output_directory() -> FontResult<PathBuf> {
        Ok(SessionManager::global().get_session_dir())
    }
    
    
    pub fn read_compressed_vectors() -> FontResult<String> {
        let session_manager = SessionManager::global();
        let session_dir = session_manager.get_session_dir();
        Self::read_compressed_vectors_for_session(session_dir)
    }
    
    fn load_font_config_from_path(config_path: &PathBuf) -> FontResult<Option<crate::config::FontConfig>> {
        use std::fs;
        use serde_json;
        
        if !config_path.exists() {
            return Ok(None);
        }
        
        let content = fs::read_to_string(config_path)?;
        let config: crate::config::FontConfig = serde_json::from_str(&content)
            .map_err(|e| crate::error::FontError::Io(std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                format!("Failed to parse font config: {}", e)
            )))?;
        
        Ok(Some(config))
    }
    
    pub fn read_compressed_vectors_for_session(session_dir: PathBuf) -> FontResult<String> {
        
        let mut result = serde_json::Map::new();
        
        for entry in fs::read_dir(&session_dir)? {
            let entry = entry?;
            if !entry.path().is_dir() {
                continue;
            }
            
            let font_dir = entry.path();
            let _safe_font_name = match font_dir.file_name().and_then(|n| n.to_str()) {
                Some(name) => name,
                None => continue,
            };
            
            // Load font config directly from the font directory
            let config_path = font_dir.join("config.json");
            let config = match Self::load_font_config_from_path(&config_path) {
                Ok(Some(config)) => config,
                Ok(None) => continue,
                Err(_) => continue,
            };
            
            // Load compressed vector
            let compressed_vector_path = font_dir.join("compressed-vector.csv");
            if !compressed_vector_path.exists() {
                continue;
            }
            
            let content = match fs::read_to_string(&compressed_vector_path) {
                Ok(content) => content,
                Err(e) => {
                    eprintln!("Failed to read file {}: {}", compressed_vector_path.display(), e);
                    continue;
                }
            };
            
            if let Some((x, y, k)) = Self::parse_compressed_vector_line(&content) {
                // Use font_name as key, store vector coordinates and config
                result.insert(
                    config.font_name.clone(),
                    serde_json::json!({
                        "x": x,
                        "y": y,
                        "k": k,
                        "config": config
                    })
                );
            }
        }
        
        serde_json::to_string(&result)
            .map_err(|e| crate::error::FontError::Io(std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                format!("Failed to serialize compressed vectors: {}", e)
            )))
    }
    
    fn parse_compressed_vector_line(content: &str) -> Option<(f64, f64, i32)> {
        let mut values = content.trim().split(',');
        let x = values.next()?.parse().ok()?;
        let y = values.next()?.parse().ok()?;
        let k = values.next()?.parse().ok()?;
        Some((x, y, k))
    }
}