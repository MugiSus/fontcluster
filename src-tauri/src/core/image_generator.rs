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

                    let mut best_handle = None;
                    let mut min_diff = i32::MAX;

                    for handle in family_handle.fonts() {
                        let weight = match handle {
                            font_kit::handle::Handle::Path { ref path, font_index } => {
                                if let Ok(data) = std::fs::read(path) {
                                    ttf_parser::Face::parse(&data, *font_index).ok().map(|f| f.weight().to_number() as i32)
                                } else { None }
                            }
                            font_kit::handle::Handle::Memory { ref bytes, font_index } => {
                                ttf_parser::Face::parse(bytes, *font_index).ok().map(|f| f.weight().to_number() as i32)
                            }
                        };

                        if let Some(w) = weight {
                            let diff = (w - target_weight).abs();
                            if diff < min_diff && diff <= 50 {
                                min_diff = diff;
                                best_handle = Some(handle.clone());
                            }
                        }
                    }

                    if let Some(handle) = best_handle {
                        // println!("🧵 Processing {} (weight: {})", family_name, target_weight);
                        if let Ok(font) = handle.load() {
                            let _permit = sem.clone().acquire_owned().await.unwrap();
                            let renderer = FontRenderer::new(Arc::clone(&config), Arc::clone(&source));
                            
                            let safe_name = crate::config::FontMetadata::generate_safe_name(&family_name, target_weight);
                            
                            let res = renderer.render_sample(&font, &safe_name);
                            match res {
                                Ok(_) => {
                                    progress_events::increase_numerator(&app_handle, 1);
                                    // println!("✅ Finished {} (weight: {})", family_name, target_weight);
                                },
                                Err(e) => {
                                    eprintln!("❌ Failed to render {}: {}", family_name, e);
                                    progress_events::decrease_denominator(&app_handle, 1);
                                },
                            }
                        } else {
                            eprintln!("❌ Failed to load font handle for {}", family_name);
                            progress_events::decrease_denominator(&app_handle, 1);
                        }
                    } else {
                        // println!("❓ No suitable weight found for {} matching {}", family_name, target_weight);
                        progress_events::decrease_denominator(&app_handle, 1);
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