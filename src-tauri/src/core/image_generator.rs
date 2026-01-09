use crate::config::{RenderConfig, DEFAULT_FONT_SIZE};
use crate::error::{Result, AppError};
use crate::rendering::FontRenderer;
use crate::core::AppState;
use std::sync::Arc;
use std::sync::atomic::Ordering;
use tauri::AppHandle;
use crate::commands::progress::progress_events;
use futures::StreamExt;

pub struct ImageGenerator {
    semaphore: Arc<tokio::sync::Semaphore>,
}

impl ImageGenerator {
    pub fn new() -> Self {
        Self { semaphore: Arc::new(tokio::sync::Semaphore::new(8)) }
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

        futures::stream::iter(tasks)
            .map(|(family_name, target_weight)| {
                let config = Arc::clone(&render_config);
                let sem = Arc::clone(&self.semaphore);
                let app_handle = app.clone();
                let state_ref = state;
                
                async move {
                    if state_ref.is_cancelled.load(Ordering::Relaxed) {
                        return;
                    }

                    let safe_name = crate::config::FontMetadata::generate_safe_name(&family_name, target_weight);
                    
                    let res: Result<()> = async {
                        let meta = crate::core::session::load_font_metadata(&config.output_dir, &safe_name)?;
                        let path = meta.path.ok_or_else(|| AppError::Processing("No path in metadata".into()))?;
                        
                        let font = font_kit::font::Font::from_path(path, meta.font_index)
                            .map_err(|e| AppError::Font(format!("Failed to load font from path: {}", e)))?;

                        let _permit = sem.clone().acquire_owned().await.unwrap();
                        let renderer = FontRenderer::new(Arc::clone(&config));
                        
                        renderer.render_sample(&font, &safe_name)?;
                        Ok(())
                    }.await;

                    match res {
                        Ok(_) => progress_events::increase_numerator(&app_handle, 1),
                        Err(e) => {
                            eprintln!("❌ Failed to process {}: {}", family_name, e);
                            progress_events::decrease_denominator(&app_handle, 1);
                        }
                    }
                }
            })
            .buffer_unordered(8)
            .collect::<Vec<_>>()
            .await;

        if state.is_cancelled.load(Ordering::Relaxed) {
            return Ok(());
        }

        state.update_status(|s| s.process_status = crate::config::ProcessStatus::Generated)?;
        Ok(())
    }
}