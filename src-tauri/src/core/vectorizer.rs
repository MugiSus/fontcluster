use crate::core::SessionManager;
use crate::error::FontResult;
use std::path::PathBuf;
use std::fs;
use tokio::task;
use futures::future::join_all;
use image::GrayImage;
use imageproc::hog::*;
use std::io::Write;

// Image vectorization service
pub struct FontImageVectorizer;

impl FontImageVectorizer {
    pub fn new() -> FontResult<Self> {
        Ok(Self)
    }
    
    pub async fn vectorize_all(&self) -> FontResult<PathBuf> {
        let png_files = self.get_png_files()?;
        println!("Found {} PNG files to vectorize", png_files.len());
        
        let tasks = self.spawn_vectorization_tasks(png_files);
        let results = join_all(tasks).await;
        
        // Count successful vectorizations
        let success_count = results.into_iter()
            .filter(|r| matches!(r, Ok(Ok(_))))
            .count();
        
        println!("Successfully vectorized {} images", success_count);
        
        Ok(SessionManager::global().get_session_dir())
    }
    
    fn get_png_files(&self) -> FontResult<Vec<PathBuf>> {
        let session_manager = SessionManager::global();
        let session_dir = session_manager.get_session_dir();
        
        Ok(fs::read_dir(&session_dir)?
            .filter_map(|entry| entry.ok())
            .filter(|entry| entry.path().is_dir())
            .filter_map(|entry| {
                let font_dir = entry.path();
                let png_path = font_dir.join("sample.png");
                if png_path.exists() {
                    Some(png_path)
                } else {
                    None
                }
            })
            .collect())
    }
    
    fn spawn_vectorization_tasks(&self, png_files: Vec<PathBuf>) -> Vec<task::JoinHandle<FontResult<Vec<f32>>>> {
        png_files
            .into_iter()
            .map(|png_path| {
                task::spawn_blocking(move || {
                    let vectorizer = ImageVectorizer::new();
                    vectorizer.vectorize_image(&png_path)
                })
            })
            .collect()
    }
}

// Individual image vectorization processor
#[derive(Clone)]
pub struct ImageVectorizer;

impl ImageVectorizer {
    pub fn new() -> Self {
        Self
    }
    
    pub fn vectorize_image(&self, png_path: &PathBuf) -> FontResult<Vec<f32>> {
        // Load image using standard image crate
        let img = image::open(png_path)
            .map_err(|e| crate::error::FontError::Vectorization(format!("Failed to open image {}: {}", png_path.display(), e)))?;
        
        // Convert to grayscale
        let gray_img = img.to_luma8();
        
        // Extract HOG features using imageproc
        let feature_vector = self.extract_hog_features(&gray_img)?;
        
        // Save vector to Vector directory
        self.save_vector_to_file(&feature_vector, png_path)?;
        
        println!("Vectorized: {} -> {} (HOG features: {})", 
                png_path.display(), 
                self.get_vector_file_path(png_path).display(),
                feature_vector.len());
        
        Ok(feature_vector)
    }

    pub fn vectorize_image_bytes(&self, image_bytes: &[u8]) -> FontResult<Vec<f32>> {
        // Load image from bytes
        let img = image::load_from_memory(image_bytes)
            .map_err(|e| crate::error::FontError::Vectorization(format!("Failed to load image from bytes: {}", e)))?;
        
        // Convert to grayscale
        let gray_img = img.to_luma8();
        
        // Extract HOG features using imageproc
        let feature_vector = self.extract_hog_features(&gray_img)?;
        
        Ok(feature_vector)
    }
    
    fn extract_hog_features(&self, img: &GrayImage) -> FontResult<Vec<f32>> {
        // Resize image to standard size for consistent feature dimensions
        let resized_img = image::imageops::resize(
            img,
            128,  // width
            64,   // height
            image::imageops::FilterType::Lanczos3
        );
        
        // Configure HOG parameters
        let hog_options = HogOptions {
            orientations: 9,
            cell_side: 8,
            block_side: 2,
            block_stride: 1,
            signed: false,
        };
        
        // Extract HOG features
        let hog_result = hog(&resized_img, hog_options);
        
        let features = match hog_result {
            Ok(features) => features,
            Err(e) => return Err(crate::error::FontError::Vectorization(format!("HOG extraction failed: {}", e))),
        };
        
        if features.is_empty() {
            return Err(crate::error::FontError::Vectorization("HOG feature extraction failed: no features generated".to_string()));
        }
        
        Ok(features)
    }
    
    fn save_vector_to_file(&self, vector: &Vec<f32>, png_path: &PathBuf) -> FontResult<()> {
        let vector_path = self.get_vector_file_path(png_path);
        
        let mut file = fs::File::create(&vector_path)
            .map_err(|e| crate::error::FontError::Vectorization(format!("Failed to create vector file {}: {}", vector_path.display(), e)))?;
        
        // Write vector data as CSV format (comma-separated values in one line)
        let csv_line = vector.iter()
            .map(|v| v.to_string())
            .collect::<Vec<String>>()
            .join(",");
        
        writeln!(file, "{}", csv_line)
            .map_err(|e| crate::error::FontError::Vectorization(format!("Failed to write vector data: {}", e)))?;
        
        Ok(())
    }
    
    fn get_vector_file_path(&self, png_path: &PathBuf) -> PathBuf {
        // png_path is like: Generated/session_id/font_name/sample.png
        // We want: Generated/session_id/font_name/vector.csv
        if let Some(parent) = png_path.parent() {
            parent.join("vector.csv")
        } else {
            PathBuf::from("vector.csv")
        }
    }
}