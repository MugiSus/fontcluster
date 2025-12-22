use crate::core::SessionManager;
use crate::error::FontResult;
use crate::commands::progress_commands::progress_events;
use std::path::PathBuf;
use std::fs;
use tokio::task;
use image::GrayImage;
use imageproc::hog::*;
use bytemuck;
use tauri::AppHandle;

// Image vectorization service
pub struct FontImageVectorizer;

impl FontImageVectorizer {
    pub fn new() -> FontResult<Self> {
        Ok(Self)
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
    
    pub async fn vectorize_all(&self, app_handle: &AppHandle) -> FontResult<PathBuf> {
        let png_files = self.get_png_files()?;
        let total_files = png_files.len();
        println!("🔢 Found {} PNG files to vectorize", total_files);
        
        // Initialize progress tracking
        progress_events::reset_progress(app_handle);
        progress_events::set_progress_denominator(app_handle, total_files as i32);
        
        // Use a semaphore to limit concurrent vectorization tasks (CPU intensive)
        use std::sync::Arc;
        use tokio::sync::Semaphore;
        use futures::StreamExt;
        
        let semaphore = Arc::new(Semaphore::new(16)); // Max 16 concurrent tasks
        const CONCURRENCY_LIMIT: usize = 32; // Limit active futures
        
        println!("🚀 Processing {} files with streaming concurrency...", total_files);
        
        futures::stream::iter(png_files)
            .map(|png_path| {
                let app_handle_clone = app_handle.clone();
                let semaphore = Arc::clone(&semaphore);
                
                async move {
                    // Acquire permit before spawning
                    let _permit = semaphore.acquire_owned().await.unwrap();
                    
                    task::spawn_blocking(move || {
                        let _permit = _permit; // Keep permit active
                        let vectorizer = ImageVectorizer::new();
                        let result = vectorizer.vectorize_image(&png_path);
                        
                        // Update progress regardless of success/failure
                        match &result {
                            Ok(features) => {
                                let file_name = png_path.file_name()
                                    .and_then(|n| n.to_str())
                                    .unwrap_or("unknown");
                                println!("✅ Vectorized: {} ({} features)", file_name, features.len());
                                progress_events::increment_progress(&app_handle_clone);
                            }
                            Err(e) => {
                                let file_name = png_path.file_name()
                                    .and_then(|n| n.to_str())
                                    .unwrap_or("unknown");
                                println!("❌ Failed to vectorize {}: {}", file_name, e);
                                progress_events::decrement_progress_denominator(&app_handle_clone);
                            }
                        }
                        result
                    }).await
                }
            })
            .buffer_unordered(CONCURRENCY_LIMIT)
            .collect::<Vec<_>>()
            .await;
        
        println!("🎉 Vectorization completed");
        
        Ok(SessionManager::global().get_session_dir())
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
        
        // Detailed logging moved to spawn_vectorization_tasks for progress tracking
        
        Ok(feature_vector)
    }
    
    fn extract_hog_features(&self, img: &GrayImage) -> FontResult<Vec<f32>> {
        // Resize into fixed canvas, stretching to fill the width/height (no padding, aspect ratio not preserved)
        const CANVAS_WIDTH: u32 = 512;
        const CANVAS_HEIGHT: u32 = 128;
        let resized_img = self.resize_without_padding(img, CANVAS_WIDTH, CANVAS_HEIGHT)?;
        
        // Configure HOG parameters
        let hog_options = HogOptions {
            orientations: 4,
            cell_side: 16,
            block_side: 2,
            block_stride: 2,
            signed: false,
        };
        
        // Extract HOG features from resized image
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
    
    fn resize_without_padding(&self, img: &GrayImage, target_width: u32, target_height: u32) -> FontResult<GrayImage> {
        // Stretch directly to the target size (aspect ratio changes)
        Ok(image::imageops::resize(
            img,
            target_width,
            target_height,
            image::imageops::FilterType::Lanczos3,
        ))
    }
    
    fn save_vector_to_file(&self, vector: &[f32], png_path: &PathBuf) -> FontResult<()> {
        let vector_path = self.get_vector_file_path(png_path);
        
        // Convert f32 slice to bytes using bytemuck (zero-copy, safe)
        let bytes = bytemuck::cast_slice(vector);
        fs::write(&vector_path, bytes)
            .map_err(|e| crate::error::FontError::Vectorization(format!("Failed to write vector file {}: {}", vector_path.display(), e)))?;
        
        Ok(())
    }
    
    fn get_vector_file_path(&self, png_path: &PathBuf) -> PathBuf {
        // png_path is like: Generated/session_id/font_name/sample.png
        // We want: Generated/session_id/font_name/vector.bin
        if let Some(parent) = png_path.parent() {
            parent.join("vector.bin")
        } else {
            PathBuf::from("vector.bin")
        }
    }
}
