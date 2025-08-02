use crate::error::FontResult;
use crate::core::SessionManager;
use font_kit::source::SystemSource;
use std::collections::HashSet;
use std::path::PathBuf;
use std::fs;

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