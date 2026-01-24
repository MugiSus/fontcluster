use crate::config::{RenderConfig, DEFAULT_FONT_SIZE};
use crate::error::{Result, AppError};
use crate::rendering::FontRenderer;
use crate::core::AppState;
use std::sync::Arc;
use std::sync::atomic::Ordering;
use tauri::AppHandle;
use crate::commands::progress::progress_events;

pub struct ImageGenerator {
}

impl ImageGenerator {
    pub fn new() -> Self {
        Self {}
    }

    // discover_fonts moved to discoverer.rs

    pub async fn generate_all(&self, app: &AppHandle, state: &AppState) -> Result<()> {
        let (discovered_fonts, session_id, text, font_size) = {
            let guard = state.current_session.lock().unwrap();
            let s = guard.as_ref().unwrap();
            let font_size = s.algorithm.as_ref()
                .and_then(|a| a.image.as_ref())
                .map(|i| i.font_size)
                .unwrap_or(DEFAULT_FONT_SIZE);
            (s.discovered_fonts.clone(), s.id.clone(), s.preview_text.clone(), font_size)
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

        let render_config = Arc::new(RenderConfig {
            text,
            font_size,
            output_dir: session_dir,
        });

        let app_handle = app.clone();
        let state_clone = state.clone();
        let render_config = Arc::clone(&render_config);

        tokio::task::spawn_blocking(move || -> Result<()> {
            use rayon::prelude::*;
            tasks.into_par_iter().for_each(|(family_name, target_weight)| {
                if state_clone.is_cancelled.load(Ordering::Relaxed) {
                    return;
                }

                let safe_name =
                    crate::config::FontMetadata::generate_safe_name(&family_name, target_weight);

                let res: Result<()> = (|| {
                    let meta = crate::core::session::load_font_metadata(
                        &render_config.output_dir,
                        &safe_name,
                    )?;
                    let path = meta
                        .path
                        .ok_or_else(|| AppError::Processing("No path in metadata".into()))?;

                    let file = std::fs::File::open(path)?;
                    let mmap = unsafe { memmap2::Mmap::map(&file)? };
                    let font = font_kit::font::Font::from_bytes(
                        Arc::new(mmap.to_vec()),
                        meta.font_index,
                    )
                    .map_err(|e| AppError::Font(format!("Failed to load font from bytes: {}", e)))?;

                    let renderer = FontRenderer::new(Arc::clone(&render_config));
                    renderer.render_sample(&font, &safe_name)?;
                    Ok(())
                })();

                match res {
                    Ok(_) => progress_events::increase_numerator(&app_handle, 1),
                    Err(e) => {
                        eprintln!("❌ Failed to process {}: {}", family_name, e);
                        let font_dir = render_config.output_dir.join(&safe_name);
                        if font_dir.exists() {
                            let _ = std::fs::remove_dir_all(font_dir);
                        }
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

        state.update_status(|s| s.process_status = crate::config::ProcessStatus::Generated)?;
        Ok(())
    }
}