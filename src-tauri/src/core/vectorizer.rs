use crate::error::Result;
use crate::core::AppState;
use crate::commands::progress::progress_events;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::Semaphore;
use tauri::AppHandle;
use futures::StreamExt;
use imageproc::hog::{hog, HogOptions};
use crate::config::{HogConfig, ImageConfig};
use bytemuck;

pub struct Vectorizer {
    semaphore: Arc<Semaphore>,
}

impl Vectorizer {
    pub fn new() -> Self {
        let threads = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(8);
        Self { semaphore: Arc::new(Semaphore::new(threads * 2)) }
    }

    pub async fn vectorize_all(&self, app: &AppHandle, state: &AppState) -> Result<()> {
        let session_dir = state.get_session_dir()?;
        let hog_config = {
            let guard = state.current_session.lock().map_err(|_| crate::error::AppError::Processing("Lock poisoned".into()))?;
            guard.as_ref()
                .and_then(|s| s.algorithm.as_ref())
                .and_then(|a| a.hog.clone())
                .unwrap_or_default()
        };
        let image_config = {
            let guard = state.current_session.lock().map_err(|_| crate::error::AppError::Processing("Lock poisoned".into()))?;
            guard.as_ref()
                .and_then(|s| s.algorithm.as_ref())
                .and_then(|a| a.image.clone())
                .unwrap_or_default()
        };

        let mut png_files = Vec::new();
        for entry in std::fs::read_dir(&session_dir)? {
            let path = entry?.path();
            if path.is_dir() {
                let png = path.join("sample.png");
                if png.exists() { png_files.push(png); }
            }
        }

        println!("🔍 Vectorizer: Found {} images to process", png_files.len());
        if png_files.is_empty() {
            println!("⚠️ Vectorizer: No images found in {}", session_dir.display());
            return Ok(());
        }

        progress_events::reset_progress(app);
        progress_events::set_progress_denominator(app, png_files.len() as i32);

        futures::stream::iter(png_files)
            .map(|path| {
                let sem = Arc::clone(&self.semaphore);
                let app_handle = app.clone();
                let path_log = path.clone();
                let h_config = hog_config.clone();
                let i_config = image_config.clone();
                async move {
                    let _permit = sem.acquire_owned().await.unwrap();
                    let res = tokio::task::spawn_blocking(move || Self::process_image(path, h_config, i_config)).await;
                    match res {
                        Ok(Ok(_)) => {
                            progress_events::increment_progress(&app_handle);
                        }
                        Ok(Err(e)) => {
                            println!("❌ Vectorization failed for {:?}: {}", path_log, e);
                            progress_events::decrement_progress_denominator(&app_handle);
                        }
                        Err(e) => {
                            println!("❌ Task join error: {}", e);
                            progress_events::decrement_progress_denominator(&app_handle);
                        }
                    }
                }
            })
            .buffer_unordered(64)
            .collect::<Vec<_>>()
            .await;

        state.update_status(|s| s.has_vectors = true)?;
        Ok(())
    }

    fn process_image(path: PathBuf, h_config: HogConfig, i_config: ImageConfig) -> Result<()> {
        let img = image::open(&path).map_err(|e| crate::error::AppError::Image(e.to_string()))?.to_luma8();
        let resized = image::imageops::resize(&img, i_config.width, i_config.height, image::imageops::FilterType::Lanczos3);
        let opts = HogOptions { 
            orientations: h_config.orientations, 
            cell_side: h_config.cell_side, 
            block_side: 2, 
            block_stride: 2, 
            signed: false 
        };
        let features = hog(&resized, opts).map_err(|e| crate::error::AppError::Processing(e.to_string()))?;
        
        let mut bin_path = path;
        bin_path.set_file_name("vector.bin");
        std::fs::write(bin_path, bytemuck::cast_slice(&features))?;
        Ok(())
    }
}
