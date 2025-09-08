use crate::core::SessionManager;
use crate::error::FontResult;
use crate::commands::progress_commands::progress_events;
use std::path::PathBuf;
use std::fs;
use tokio::task;
use futures::future::join_all;
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
    
    pub async fn vectorize_all(&self, app_handle: &AppHandle) -> FontResult<PathBuf> {
        let png_files = self.get_png_files()?;
        let total_files = png_files.len();
        println!("🔢 Found {} PNG files to vectorize", total_files);

        // Decide canvas size based on median dimensions of input images (rounded to multiple of 8)
        let (canvas_width, canvas_height) = if total_files > 0 {
            match self.compute_canvas_size(&png_files) {
                Ok((w, h)) => {
                    println!("🖼️ Using computed canvas size: {}x{} (median, 8-aligned)", w, h);
                    (w, h)
                }
                Err(e) => {
                    println!("⚠️ Failed to compute canvas size ({}). Falling back to 512x96.", e);
                    (512, 96)
                }
            }
        } else {
            println!("ℹ️ No images found; using default canvas 512x96.");
            (512, 96)
        };

        // Initialize progress tracking
        progress_events::reset_progress(app_handle);
        progress_events::set_progress_denominator(app_handle, total_files as i32);
        
        // Process in batches to avoid overwhelming the system
        const BATCH_SIZE: usize = 50; // Process 50 images at a time
        let mut success_count = 0;
        
        for (batch_idx, batch) in png_files.chunks(BATCH_SIZE).enumerate() {
            println!("🚀 Processing vectorization batch {}/{} ({} files)", 
                batch_idx + 1,
                (total_files + BATCH_SIZE - 1) / BATCH_SIZE,
                batch.len()
            );
            
            let tasks = self.spawn_vectorization_tasks(batch.to_vec(), app_handle, canvas_width, canvas_height);
            let results = join_all(tasks).await;
            
            // Count successful vectorizations in this batch
            let batch_success = results.into_iter()
                .filter(|r| matches!(r, Ok(Ok(_))))
                .count();
            success_count += batch_success;
            
            println!("✅ Batch {} completed: {}/{} successful", batch_idx + 1, batch_success, batch.len());
        }
        
        println!("🎉 Vectorization completed: {}/{} files successfully processed", success_count, total_files);
        
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
    
    fn spawn_vectorization_tasks(&self, png_files: Vec<PathBuf>, app_handle: &AppHandle, target_width: u32, target_height: u32) -> Vec<task::JoinHandle<FontResult<Vec<f32>>>> {
        png_files
            .into_iter()
            .map(|png_path| {
                let app_handle_clone = app_handle.clone();
                let tw = target_width;
                let th = target_height;
                task::spawn_blocking(move || {
                    let vectorizer = ImageVectorizer::new(tw, th);
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
                })
            })
            .collect()
    }

    fn compute_canvas_size(&self, png_files: &[PathBuf]) -> FontResult<(u32, u32)> {
        // Gather dimensions using lightweight header read
        let mut widths: Vec<u32> = Vec::with_capacity(png_files.len());
        let mut heights: Vec<u32> = Vec::with_capacity(png_files.len());
        for path in png_files {
            match image::image_dimensions(path) {
                Ok((w, h)) => {
                    widths.push(w);
                    heights.push(h);
                }
                Err(e) => {
                    println!("⚠️ Skipping {} due to dimension read error: {}", path.display(), e);
                }
            }
        }

        if widths.is_empty() || heights.is_empty() {
            return Err(crate::error::FontError::Vectorization("No valid image dimensions to compute median".into()));
        }

        widths.sort_unstable();
        heights.sort_unstable();

        let mw = median_u32(&widths);
        let mh = median_u32(&heights);

        let mw_aligned = round_to_multiple_of_8_nearest(mw.max(8));
        let mh_aligned = round_to_multiple_of_8_nearest(mh.max(8));

        Ok((mw_aligned, mh_aligned))
    }
}

fn median_u32(sorted_vals: &[u32]) -> u32 {
    let n = sorted_vals.len();
    if n == 0 {
        return 0;
    }
    if n % 2 == 1 {
        sorted_vals[n / 2]
    } else {
        let a = sorted_vals[n / 2 - 1] as f32;
        let b = sorted_vals[n / 2] as f32;
        ((a + b) / 2.0).round() as u32
    }
}

fn round_to_multiple_of_8_nearest(v: u32) -> u32 {
    ((v + 4) / 8) * 8
}

// Individual image vectorization processor
pub struct ImageVectorizer {
    target_width: u32,
    target_height: u32,
}

impl ImageVectorizer {
    pub fn new(target_width: u32, target_height: u32) -> Self {
        Self { target_width, target_height }
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
        // Create padded image with computed canvas size while preserving aspect ratio
        let padded_img = self.resize_with_padding(img, self.target_width, self.target_height)?;
        
        // Configure HOG parameters
        let hog_options = HogOptions {
            orientations: 9,
            cell_side: 8,
            block_side: 2,
            block_stride: 1,
            signed: false,
        };
        
        // Extract HOG features from padded image
        let hog_result = hog(&padded_img, hog_options);
        
        let features = match hog_result {
            Ok(features) => features,
            Err(e) => return Err(crate::error::FontError::Vectorization(format!("HOG extraction failed: {}", e))),
        };
        
        if features.is_empty() {
            return Err(crate::error::FontError::Vectorization("HOG feature extraction failed: no features generated".to_string()));
        }
        
        Ok(features)
    }
    
    fn resize_with_padding(&self, img: &GrayImage, target_width: u32, target_height: u32) -> FontResult<GrayImage> {
        let original_width = img.width();
        let original_height = img.height();
        
        println!("Original size: {}x{}, target canvas: {}x{}", 
                original_width, original_height, target_width, target_height);
        
        // Calculate scaling factor to fit within target while preserving aspect ratio
        let scale_x = target_width as f32 / original_width as f32;
        let scale_y = target_height as f32 / original_height as f32;
        let scale = scale_x.min(scale_y); // Use smaller scale to fit within bounds
        
        let new_width = (original_width as f32 * scale) as u32;
        let new_height = (original_height as f32 * scale) as u32;
        
        println!("Scaled size: {}x{} (scale: {:.3})", new_width, new_height, scale);
        
        // Resize the image while preserving aspect ratio
        let resized_img = image::imageops::resize(
            img,
            new_width,
            new_height,
            image::imageops::FilterType::Lanczos3
        );
        
        // Create white canvas
        let mut canvas = image::GrayImage::new(target_width, target_height);
        // Fill with white (255)
        for pixel in canvas.pixels_mut() {
            *pixel = image::Luma([255u8]);
        }
        
        // Calculate position to center the resized image
        let offset_x = (target_width - new_width) / 2;
        let offset_y = (target_height - new_height) / 2;
        
        println!("Padding offset: ({}, {})", offset_x, offset_y);
        
        // Copy resized image onto canvas
        image::imageops::overlay(&mut canvas, &resized_img, offset_x as i64, offset_y as i64);
        
        Ok(canvas)
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
