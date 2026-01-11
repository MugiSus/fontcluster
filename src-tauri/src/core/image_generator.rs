use crate::config::RenderConfig;
use crate::error::{Result, AppError};
use crate::rendering::FontRenderer;
use crate::core::AppState;
use std::sync::Arc;
use std::sync::atomic::Ordering;
use tauri::AppHandle;
use imageproc::hog::{hog, HogOptions};
use crate::commands::progress::progress_events;

pub struct ImageGenerator {
}

impl ImageGenerator {
    pub fn new() -> Self {
        Self {}
    }

    // discover_fonts moved to discoverer.rs
    pub async fn generate_all(&self, app: &AppHandle, state: &AppState) -> Result<()> {
        let (discovered_fonts, session_id, text, hog_config, image_config) = {
            let guard = state.current_session.lock().unwrap();
            let s = guard.as_ref().unwrap();
            let (hog_config, image_config) = s.algorithm.as_ref().map(|a| {
                (a.hog.clone().unwrap_or_default(), a.image.clone().unwrap_or_default())
            }).unwrap_or_default();
            (s.discovered_fonts.clone(), s.id.clone(), s.preview_text.clone(), hog_config, image_config)
        };
        let session_dir = AppState::get_base_dir()?.join("Generated").join(&session_id);

        let mut tasks = Vec::new();
        for (weight, families) in discovered_fonts {
            for family in families {
                tasks.push((family, weight));
            }
        }

        println!("📋 Total image generation tasks: {}", tasks.len());
        if tasks.is_empty() {
            println!("⚠️ No fonts discovered for weights. Skipping generation.");
        }

        progress_events::reset_progress(app);
        progress_events::set_progress_denominator(app, tasks.len() as i32);

        use rayon::prelude::*;
        let render_config = Arc::new(RenderConfig {
            text,
            font_size: image_config.font_size,
            output_dir: session_dir,
        });

        tasks.into_par_iter().for_each(|(family_name, target_weight)| {
            if state.is_cancelled.load(Ordering::Relaxed) {
                return;
            }

            let h_config = hog_config.clone();
            let i_config = image_config.clone();
            let safe_name = crate::config::FontMetadata::generate_safe_name(&family_name, target_weight);
            
            let res: Result<()> = (|| {
                let meta = crate::core::session::load_font_metadata(&render_config.output_dir, &safe_name)?;
                let path = meta.path.ok_or_else(|| AppError::Processing("No path in metadata".into()))?;
                
                let file = std::fs::File::open(path)?;
                let mmap = unsafe { memmap2::Mmap::map(&file)? };
                let font = font_kit::font::Font::from_bytes(Arc::new(mmap.to_vec()), meta.font_index)
                    .map_err(|e| AppError::Font(format!("Failed to load font from bytes: {}", e)))?;

                let renderer = FontRenderer::new(Arc::clone(&render_config));
                let img = renderer.render_sample(&font, &safe_name)?;

                // Direct to HOG
                let resized = image::imageops::resize(&img, i_config.width, i_config.height, image::imageops::FilterType::Lanczos3);
                let opts = HogOptions { 
                    orientations: h_config.orientations, 
                    cell_side: h_config.cell_side, 
                    block_side: h_config.block_side, 
                    block_stride: h_config.block_stride, 
                    signed: false 
                };
                let features = hog(&resized, opts).map_err(|e| AppError::Processing(e.to_string()))?;
                
                let bin_path = render_config.output_dir.join(&safe_name).join("vector.bin");
                std::fs::write(bin_path, bytemuck::cast_slice(&features))?;

                Ok(())
            })();

            match res {
                Ok(_) => progress_events::increase_numerator(app, 1),
                Err(e) => {
                    eprintln!("❌ Failed to process {}: {}", family_name, e);
                    let font_dir = render_config.output_dir.join(&safe_name);
                    if font_dir.exists() {
                        let _ = std::fs::remove_dir_all(font_dir);
                    }
                    progress_events::decrease_denominator(app, 1);
                }
            }
        });

        if state.is_cancelled.load(Ordering::Relaxed) {
            return Ok(());
        }

        state.update_status(|s| s.process_status = crate::config::ProcessStatus::Generated)?;
        Ok(())
    }
}