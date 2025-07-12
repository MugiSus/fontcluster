use crate::error::FontResult;
use crate::core::SessionManager;
use font_kit::source::SystemSource;
use std::collections::HashSet;
use std::path::PathBuf;
use std::fs;

// Service layer for font operations
pub struct FontService;

impl FontService {
    pub fn get_system_fonts() -> Vec<String> {
        SystemSource::new()
            .all_families()
            .map(|families| {
                let mut fonts: Vec<String> = families.into_iter()
                    .map(|f| f.to_string())
                    .collect::<HashSet<_>>()
                    .into_iter()
                    .collect();
                fonts.sort();
                fonts
            })
            .unwrap_or_default()
    }
    
    pub fn create_output_directory() -> FontResult<PathBuf> {
        Ok(SessionManager::global().get_session_dir())
    }
    
    
    pub fn read_compressed_vectors() -> FontResult<String> {
        let session_manager = SessionManager::global();
        let session_dir = session_manager.get_session_dir();
        
        let mut result = Vec::new();
        
        for entry in fs::read_dir(&session_dir)? {
            let entry = entry?;
            if !entry.path().is_dir() {
                continue;
            }
            
            let font_dir = entry.path();
            let safe_font_name = match font_dir.file_name().and_then(|n| n.to_str()) {
                Some(name) => name,
                None => continue,
            };
            
            // Load font config
            let config = match session_manager.load_font_config(safe_font_name)? {
                Some(config) => config,
                None => continue,
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
                result.push(serde_json::json!({
                    "config": config,
                    "vector": [x, y, k]
                }));
            }
        }
        
        serde_json::to_string(&result)
            .map_err(|e| crate::error::FontError::Io(std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                format!("Failed to serialize compressed vectors: {}", e)
            )))
    }
    
    fn parse_compressed_vector_line(content: &str) -> Option<(f64, f64, u32)> {
        let mut values = content.trim().split(',');
        let x = values.next()?.parse().ok()?;
        let y = values.next()?.parse().ok()?;
        let k = values.next()?.parse().ok()?;
        Some((x, y, k))
    }
}