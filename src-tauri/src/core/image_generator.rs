use crate::config::{RenderConfig, DEFAULT_FONT_SIZE};
use crate::error::Result;
use crate::rendering::FontRenderer;
use crate::core::AppState;
use std::sync::Arc;
use std::sync::atomic::Ordering;
use tokio::sync::Semaphore;
use font_kit::source::SystemSource;
use tauri::AppHandle;
use crate::commands::progress::progress_events;
use futures::StreamExt;

pub struct ImageGenerator {
    source: Arc<SystemSource>,
    semaphore: Arc<tokio::sync::Semaphore>,
}

impl ImageGenerator {
    pub fn new() -> Self {
        let threads = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(8);
        Self {
            source: Arc::new(SystemSource::new()),
            semaphore: Arc::new(Semaphore::new(threads * 2)),
        }
    }

    // discover_fonts moved to discoverer.rs

    pub async fn generate_all(&self, app: &AppHandle, state: &AppState) -> Result<()> {
        let (discovered_fonts, session_dir, text, font_size) = {
            let guard = state.current_session.lock().unwrap();
            let s = guard.as_ref().unwrap();
            let font_size = s.algorithm.as_ref()
                .and_then(|a| a.image.as_ref())
                .map(|i| i.font_size)
                .unwrap_or(DEFAULT_FONT_SIZE);
            (s.discovered_fonts.clone(), state.get_session_dir()?, s.preview_text.clone(), font_size)
        };

        let mut tasks = Vec::new();
        for (weight, families) in discovered_fonts {
            for family in families {
                tasks.push((family, weight));
            }
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
                let source = Arc::clone(&self.source);
                let sem = Arc::clone(&self.semaphore);
                let app_handle = app.clone();
                let state_ref = state;
                
                async move {
                    if state_ref.is_cancelled.load(Ordering::Relaxed) {
                        return;
                    }

                    let family_handle = match source.select_family_by_name(&family_name) {
                        Ok(h) => h,
                        Err(_) => {
                            progress_events::decrease_denominator(&app_handle, 1);
                            return;
                        }
                    };

                    let mut best_match = None;
                    let mut min_diff = i32::MAX;

                    for handle in family_handle.fonts() {
                        // LOAD here because we need metrics/rasterization
                        if let Ok(font) = handle.load() {
                            let diff = (font.properties().weight.0 as i32 - target_weight).abs();
                            if diff < min_diff && diff <= 50 {
                                min_diff = diff;
                                best_match = Some(font);
                            }
                        }
                    }

                    if let Some(font) = best_match {
                        let _permit = sem.clone().acquire_owned().await.unwrap();
                        let renderer = FontRenderer::new(Arc::clone(&config), Arc::clone(&source));
                        
                        // We still need metadata for the final save
                        // We could have cached it from discovery, but let's re-extract or reuse.
                        // For simplicity, let's re-extract meta from the loaded font for now, 
                        // or better yet, make analyze_font_data return something we can reuse.
                        // ExtractedMeta doesn't have the font-kit Font, so we need to reload it anyway.
                        
                        let weight_names: Vec<String> = family_handle.fonts().iter()
                            .filter_map(|h| h.load().ok())
                            .map(|f| format!("{:?}", f.properties().weight))
                            .collect();

                        if let Ok(meta) = FontRenderer::extract_meta(&font, weight_names) {
                            let res = renderer.render_and_save(&font, &family_name, target_weight, meta);
                            match res {
                                Ok(_) => progress_events::increase_numerator(&app_handle, 1),
                                _ => progress_events::decrease_denominator(&app_handle, 1),
                            }
                        } else {
                            progress_events::decrease_denominator(&app_handle, 1);
                        }
                    } else {
                        progress_events::decrease_denominator(&app_handle, 1);
                    }
                }
            })
            .buffer_unordered(32)
            .collect::<Vec<_>>()
            .await;

        if state.is_cancelled.load(Ordering::Relaxed) {
            return Ok(());
        }

        state.update_status(|s| s.process_status = crate::config::ProcessStatus::Generated)?;
        Ok(())
    }
}