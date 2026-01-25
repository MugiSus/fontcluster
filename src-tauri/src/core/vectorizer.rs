use crate::commands::progress::progress_events;
use crate::config::HogConfig;
use crate::core::AppState;
use crate::error::{AppError, Result};
use bytemuck;
use imageproc::hog::{hog, HogOptions};
use std::path::PathBuf;
use std::sync::atomic::Ordering;
use tauri::AppHandle;

pub struct Vectorizer {}

impl Vectorizer {
    pub fn new() -> Self {
        Self {}
    }

    pub async fn vectorize_all(&self, app: &AppHandle, state: &AppState) -> Result<()> {
        let session_dir = state.get_session_dir()?;
        let hog_config = {
            let guard = state
                .current_session
                .lock()
                .map_err(|_| crate::error::AppError::Processing("Lock poisoned".into()))?;
            guard
                .as_ref()
                .and_then(|s| s.algorithm.as_ref())
                .and_then(|a| a.hog.clone())
                .unwrap_or_default()
        };

        let session_dir_display = session_dir.display().to_string();
        let png_files = tokio::task::spawn_blocking(move || {
            let mut png_files = Vec::new();
            for entry in jwalk::WalkDir::new(session_dir.join("samples"))
                .into_iter()
                .filter_map(|e| e.ok())
            {
                if entry.file_type().is_dir() {
                    let png = entry.path().join("sample.png");
                    if png.exists() {
                        png_files.push(png);
                    }
                }
            }
            png_files
        })
        .await
        .map_err(|e| AppError::Processing(e.to_string()))?;

        println!("🔍 Vectorizer: Found {} images to process", png_files.len());
        if png_files.is_empty() {
            println!("⚠️ Vectorizer: No images found in {}", session_dir_display);
            return Ok(());
        }

        progress_events::reset_progress(app);
        progress_events::set_progress_denominator(app, png_files.len() as i32);

        let app_handle = app.clone();
        let state_clone = state.clone();
        tokio::task::spawn_blocking(move || -> Result<()> {
            use rayon::prelude::*;
            png_files.into_par_iter().for_each(|path| {
                if state_clone.is_cancelled.load(Ordering::Relaxed) {
                    return;
                }
                let res = Self::process_image(path.clone(), hog_config.clone());
                match res {
                    Ok(_) => {
                        progress_events::increase_numerator(&app_handle, 1);
                    }
                    Err(e) => {
                        println!("❌ Vectorization failed for {:?}: {}", path, e);
                        progress_events::decrease_denominator(&app_handle, 1);
                    }
                }
            });
            Ok(())
        })
        .await
        .map_err(|e| AppError::Processing(e.to_string()))??;

        if state.is_cancelled.load(Ordering::Relaxed) {
            return Ok(());
        }

        state.update_status(|s| s.process_status = crate::config::ProcessStatus::Vectorized)?;
        Ok(())
    }

    fn process_image(path: PathBuf, h_config: HogConfig) -> Result<()> {
        let dyn_img = image::open(&path)
            .map_err(|e| crate::error::AppError::Image(format!("Failed to open image {}: {}", path.display(), e)))?;
        
        // Handle transparency: composite over black background
        // The generated images are White (255) + Alpha.
        // If we just converted to Luma8, the transparent pixels (which are technically White but Alpha 0)
        // would become White, losing the contrast.
        let img = if dyn_img.color().has_alpha() {
            let rgba_img = dyn_img.to_rgba8();
            let mut canvas = image::RgbaImage::from_pixel(
                rgba_img.width(),
                rgba_img.height(),
                image::Rgba([0, 0, 0, 255]),
            );
            image::imageops::overlay(&mut canvas, &rgba_img, 0, 0);
            image::DynamicImage::ImageRgba8(canvas).to_luma8()
        } else {
            dyn_img.to_luma8()
        };

        let target_width = Self::align_to_hog_constraints(
            h_config.width as f32,
            h_config.cell_side,
            h_config.block_side,
            h_config.block_stride,
        );
        let target_height = Self::align_to_hog_constraints(
            h_config.height as f32,
            h_config.cell_side,
            h_config.block_side,
            h_config.block_stride,
        );

        let resized = image::imageops::resize(
            &img,
            target_width,
            target_height,
            image::imageops::FilterType::Lanczos3,
        );
        let opts = HogOptions {
            orientations: h_config.orientations,
            cell_side: h_config.cell_side,
            block_side: h_config.block_side,
            block_stride: h_config.block_stride,
            signed: false,
        };
        let features =
            hog(&resized, opts).map_err(|e| crate::error::AppError::Processing(e.to_string()))?;

        let mut bin_path = path.clone();
        bin_path.set_file_name("vector.bin");
        std::fs::write(&bin_path, bytemuck::cast_slice(&features))
            .map_err(|e| crate::error::AppError::Io(format!("Failed to write vector bin {}: {}", bin_path.display(), e)))?;
        Ok(())
    }

    fn align_to_hog_constraints(
        measured_size: f32,
        cell_side: usize,
        block_side: usize,
        block_stride: usize,
    ) -> u32 {
        let min_cells_required = (measured_size / cell_side as f32).ceil() as usize;
        let n = ((min_cells_required as i32 - block_side as i32).max(0) as f32
            / block_stride as f32)
            .ceil() as usize;
        let total_cells = block_side + n * block_stride;
        (total_cells * cell_side) as u32
    }
}
