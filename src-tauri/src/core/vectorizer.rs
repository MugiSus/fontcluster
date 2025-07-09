use crate::core::FontService;
use crate::error::FontResult;
use std::path::PathBuf;
use std::fs;
use tokio::task;
use futures::future::join_all;
use image::GrayImage;
use imageproc::hog::*;
use std::io::Write;

// Image vectorization service
pub struct FontImageVectorizer {
    output_dir: PathBuf,
}

impl FontImageVectorizer {
    pub fn new() -> FontResult<Self> {
        let output_dir = FontService::get_images_directory()?;
        Ok(Self { output_dir })
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
        
        Ok(self.output_dir.clone())
    }
    
    fn get_png_files(&self) -> FontResult<Vec<PathBuf>> {
        let mut png_files = Vec::new();
        
        for entry in fs::read_dir(&self.output_dir)? {
            let entry = entry?;
            let path = entry.path();
            
            if path.extension().and_then(|ext| ext.to_str()) == Some("png") {
                png_files.push(path);
            }
        }
        
        Ok(png_files)
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
        let vector_dir = FontService::get_vectors_directory().unwrap_or_else(|_| PathBuf::from("."));
        let file_name = png_path.file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("unknown");
        vector_dir.join(format!("{}.csv", file_name))
    }
}