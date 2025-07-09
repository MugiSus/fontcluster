use crate::error::{FontResult, FontError};
use font_kit::source::SystemSource;
use std::collections::HashSet;
use std::path::PathBuf;
use std::fs;

// Service layer for font operations
pub struct FontService;

impl FontService {
    pub fn get_system_fonts() -> Vec<String> {
        let source = SystemSource::new();
        let mut font_families = HashSet::new();
        
        match source.all_families() {
            Ok(families) => {
                font_families.extend(families.iter().map(|f| f.to_string()));
            }
            Err(_) => {
                return Vec::new();
            }
        }
        
        let mut fonts: Vec<String> = font_families.into_iter().collect();
        fonts.sort();
        fonts.dedup();
        fonts
    }
    
    pub fn create_output_directory() -> FontResult<PathBuf> {
        let app_data_dir = dirs::data_dir()
            .ok_or_else(|| FontError::Io(std::io::Error::new(
                std::io::ErrorKind::NotFound,
                "Failed to get app data directory"
            )))?
            .join("FontCluster")
            .join("Generated");
        
        // Create subdirectories
        let images_dir = app_data_dir.join("Images");
        let vectors_dir = app_data_dir.join("Vectors");
        let compressed_vectors_dir = app_data_dir.join("CompressedVectors");
        
        fs::create_dir_all(&images_dir)?;
        fs::create_dir_all(&vectors_dir)?;
        fs::create_dir_all(&compressed_vectors_dir)?;

        Ok(app_data_dir)
    }
    
    pub fn get_images_directory() -> FontResult<PathBuf> {
        Ok(Self::create_output_directory()?.join("Images"))
    }
    
    pub fn get_vectors_directory() -> FontResult<PathBuf> {
        Ok(Self::create_output_directory()?.join("Vectors"))
    }
    
    pub fn get_compressed_vectors_directory() -> FontResult<PathBuf> {
        Ok(Self::create_output_directory()?.join("CompressedVectors"))
    }
}