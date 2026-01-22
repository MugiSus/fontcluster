use crate::error::Result;
use crate::core::AppState;
use crate::commands::progress::progress_events;
use std::path::PathBuf;
use std::sync::atomic::Ordering;
use tauri::AppHandle;
use imageproc::hog::{hog, HogOptions};
use crate::config::HogConfig;
use bytemuck;

pub struct Vectorizer {
}

impl Vectorizer {
    pub fn new() -> Self {
        Self {}
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

        let mut png_files = Vec::new();
        for entry in jwalk::WalkDir::new(&session_dir)
            .into_iter()
            .filter_map(|e| e.ok()) {
            if entry.file_type().is_dir() {
                let png = entry.path().join("sample.png");
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

        use rayon::prelude::*;
        png_files.into_par_iter().for_each(|path| {
            if state.is_cancelled.load(Ordering::Relaxed) {
                return;
            }
            let res = Self::process_image(path.clone(), hog_config.clone());
            match res {
                Ok(_) => {
                    progress_events::increase_numerator(app, 1);
                }
                Err(e) => {
                    println!("❌ Vectorization failed for {:?}: {}", path, e);
                    progress_events::decrease_denominator(app, 1);
                }
            }
        });

        if state.is_cancelled.load(Ordering::Relaxed) {
            return Ok(());
        }

        state.update_status(|s| s.process_status = crate::config::ProcessStatus::Vectorized)?;
        Ok(())
    }

    fn process_image(path: PathBuf, h_config: HogConfig) -> Result<()> {
        let img = image::open(&path).map_err(|e| crate::error::AppError::Image(e.to_string()))?.to_luma8();
        let resized = image::imageops::resize(&img, h_config.width, h_config.height, image::imageops::FilterType::Lanczos3);
        let opts = HogOptions { 
            orientations: h_config.orientations, 
            cell_side: h_config.cell_side, 
            block_side: h_config.block_side, 
            block_stride: h_config.block_stride, 
            signed: false 
        };
        let features = hog(&resized, opts).map_err(|e| crate::error::AppError::Processing(e.to_string()))?;
        
        let mut bin_path = path;
        bin_path.set_file_name("vector.bin");
        std::fs::write(bin_path, bytemuck::cast_slice(&features))?;
        Ok(())
    }
}
