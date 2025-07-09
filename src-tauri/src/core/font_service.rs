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
    
    pub fn read_compressed_vectors() -> FontResult<Vec<(String, f64, f64)>> {
        let comp_vector_dir = Self::get_compressed_vectors_directory()?;
        let mut coordinates = Vec::new();
        
        for entry in fs::read_dir(&comp_vector_dir)? {
            let entry = entry?;
            let path = entry.path();
            
            if path.extension().and_then(|ext| ext.to_str()) == Some("csv") {
                match fs::read_to_string(&path) {
                    Ok(content) => {
                        if let Some(coordinate) = Self::parse_compressed_vector_line(&content) {
                            coordinates.push(coordinate);
                        }
                    }
                    Err(e) => eprintln!("Failed to read file {}: {}", path.display(), e),
                }
            }
        }
        
        Ok(coordinates)
    }
    
    fn parse_compressed_vector_line(content: &str) -> Option<(String, f64, f64)> {
        let values: Vec<&str> = content.trim().split(',').collect();
        if values.len() >= 3 {
            let font_name = values[0];
            if let (Ok(x), Ok(y)) = (values[1].parse::<f64>(), values[2].parse::<f64>()) {
                return Some((font_name.to_string(), x, y));
            }
        }
        None
    }
}