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
            
            let tasks = self.spawn_vectorization_tasks(batch.to_vec(), app_handle);
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
    
    fn spawn_vectorization_tasks(&self, png_files: Vec<PathBuf>, app_handle: &AppHandle) -> Vec<task::JoinHandle<FontResult<Vec<f32>>>> {
        png_files
            .into_iter()
            .map(|png_path| {
                let app_handle_clone = app_handle.clone();
                task::spawn_blocking(move || {
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
        
        // Extract HOG features from the original image (no resizing)
        let feature_vector = self.extract_hog_features(&gray_img)?;

        // Compress variable-length HOG to fixed 2048 dims via feature hashing
        const HASHED_DIM: usize = 2048;
        let mut hashed = Self::hash_features_signed(&feature_vector, HASHED_DIM);
        // Signed square-root (power) normalization to suppress burstiness
        Self::power_normalize_signed_in_place(&mut hashed, 0.5);
        // Final L2 normalization
        Self::l2_normalize_in_place(&mut hashed);
        
        // Save vector to Vector directory
        self.save_vector_to_file(&hashed, png_path)?;
        
        // Detailed logging moved to spawn_vectorization_tasks for progress tracking
        
        Ok(hashed)
    }
    
    fn extract_hog_features(&self, img: &GrayImage) -> FontResult<Vec<f32>> {
        // Configure HOG parameters
        let hog_options = HogOptions {
            orientations: 9,
            cell_side: 8,
            block_side: 2,
            block_stride: 1,
            signed: false,
        };
        
        // Ensure dimensions align to HOG cell grid without resizing (pad only)
        let padded = Self::pad_to_hog_grid(img, hog_options.cell_side as u32, hog_options.block_side as u32);
        
        // Extract HOG features on padded image
        let hog_result = hog(&padded, hog_options);
        
        let features = match hog_result {
            Ok(features) => features,
            Err(e) => return Err(crate::error::FontError::Vectorization(format!("HOG extraction failed: {}", e))),
        };
        
        if features.is_empty() {
            return Err(crate::error::FontError::Vectorization("HOG feature extraction failed: no features generated".to_string()));
        }
        
        Ok(features)
    }

    /// Feature hashing (hashing trick) with signed buckets
    /// - Deterministic FNV-1a 64-bit hash on index
    /// - Bucket = h1 % dim, Sign = (-1)^{h2 & 1}
    fn hash_features_signed(values: &[f32], dim: usize) -> Vec<f32> {
        fn fnv1a64(x: u64) -> u64 {
            let mut h: u64 = 0xcbf29ce484222325;
            for b in x.to_le_bytes() {
                h ^= b as u64;
                h = h.wrapping_mul(0x100000001b3);
            }
            h
        }

        let mut out = vec![0f32; dim.max(1)];
        if dim == 0 || values.is_empty() {
            return out;
        }

        for (i, &v) in values.iter().enumerate() {
            let i64 = i as u64;
            let h1 = fnv1a64(i64);
            let h2 = fnv1a64(h1 ^ 0x9e3779b97f4a7c15);
            let bucket = (h1 % (dim as u64)) as usize;
            let sign = if (h2 & 1) == 0 { 1.0f32 } else { -1.0f32 };
            out[bucket] += sign * v;
        }
        out
    }

    /// In-place L2 normalization with zero-safe guard
    fn l2_normalize_in_place(vec: &mut [f32]) {
        let sum_sq: f32 = vec.iter().map(|x| (*x) * (*x)).sum();
        let norm = sum_sq.sqrt();
        if norm > 0.0 {
            let inv = 1.0 / norm.max(1e-12);
            for x in vec.iter_mut() {
                *x *= inv;
            }
        }
    }

    /// In-place signed power normalization: x <- sign(x) * |x|^alpha
    fn power_normalize_signed_in_place(vec: &mut [f32], alpha: f32) {
        let a = if alpha > 0.0 { alpha } else { 0.5 };
        for x in vec.iter_mut() {
            let s = if *x >= 0.0 { 1.0 } else { -1.0 };
            let mag = x.abs().powf(a);
            *x = s * mag;
        }
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

    /// Pad image to the nearest multiples of cell size and ensure at least block_side cells
    /// No resampling is performed; content is centered on a black background.
    fn pad_to_hog_grid(img: &GrayImage, cell_side: u32, block_side: u32) -> GrayImage {
        let (w, h) = (img.width(), img.height());
        let mut cells_x = (w + cell_side - 1) / cell_side; // ceil(w / cell_side)
        let mut cells_y = (h + cell_side - 1) / cell_side; // ceil(h / cell_side)
        // Ensure enough cells for at least one block
        cells_x = cells_x.max(block_side);
        cells_y = cells_y.max(block_side);
        let new_w = cells_x * cell_side;
        let new_h = cells_y * cell_side;

        if new_w == w && new_h == h {
            return img.clone();
        }

        let mut canvas = image::GrayImage::new(new_w, new_h);
        // Fill with black (0) to match renderer's background
        for p in canvas.pixels_mut() {
            *p = image::Luma([0u8]);
        }

        // Center original image on the canvas
        let off_x = ((new_w - w) / 2) as i64;
        let off_y = ((new_h - h) / 2) as i64;
        image::imageops::overlay(&mut canvas, img, off_x, off_y);
        canvas
    }
}
