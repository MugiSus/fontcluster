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
    
    pub fn get_images_directory() -> FontResult<PathBuf> {
        Ok(SessionManager::global().get_images_directory())
    }
    
    pub fn get_vectors_directory() -> FontResult<PathBuf> {
        Ok(SessionManager::global().get_vectors_directory())
    }
    
    pub fn get_compressed_vectors_directory() -> FontResult<PathBuf> {
        Ok(SessionManager::global().get_compressed_vectors_directory())
    }
    
    pub fn read_compressed_vectors() -> FontResult<Vec<(String, f64, f64)>> {
        let comp_vector_dir = SessionManager::global().get_compressed_vectors_directory();
        
        Ok(fs::read_dir(&comp_vector_dir)?
            .filter_map(|entry| entry.ok())
            .map(|entry| entry.path())
            .filter(|path| path.extension().and_then(|ext| ext.to_str()) == Some("csv"))
            .filter_map(|path| {
                fs::read_to_string(&path)
                    .map_err(|e| {
                        eprintln!("Failed to read file {}: {}", path.display(), e);
                        e
                    })
                    .ok()
                    .and_then(|content| Self::parse_compressed_vector_line(&content))
            })
            .collect())
    }
    
    fn parse_compressed_vector_line(content: &str) -> Option<(String, f64, f64)> {
        let mut values = content.trim().split(',');
        let font_name = values.next()?.to_string();
        let x = values.next()?.parse().ok()?;
        let y = values.next()?.parse().ok()?;
        Some((font_name, x, y))
    }
}