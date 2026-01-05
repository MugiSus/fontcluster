use crate::config::{RenderConfig, DEFAULT_FONT_SIZE};
use crate::error::Result;
use crate::rendering::{FontRenderer, ExtractedMeta};
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

    pub async fn generate_all(&self, app: &AppHandle, state: &AppState) -> Result<()> {
        let session_dir = state.get_session_dir()?;
        let (text, weights, font_size) = {
            let guard = state.current_session.lock().unwrap();
            let s = guard.as_ref().unwrap();
            let font_size = s.algorithm.as_ref()
                .and_then(|a| a.image.as_ref())
                .map(|i| i.font_size)
                .unwrap_or(DEFAULT_FONT_SIZE);
            (s.preview_text.clone(), s.weights.clone(), font_size)
        };

        let families: Vec<String> = self.source.all_families()
            .unwrap_or_default()
            .into_iter()
            .filter(|f| !f.to_lowercase().contains("emoji") && !f.to_lowercase().contains("icon"))
            .collect();

        // Count total tasks for progress reporting
        let total_tasks = families.len() * weights.len();
        progress_events::reset_progress(app);
        progress_events::set_progress_denominator(app, total_tasks as i32);

        let render_config = Arc::new(RenderConfig {
            text,
            font_size,
            output_dir: session_dir,
        });

        futures::stream::iter(families)
            .map(|family| {
                let config = Arc::clone(&render_config);
                let source = Arc::clone(&self.source);
                let sem = Arc::clone(&self.semaphore);
                let app_handle = app.clone();
                let family_name = family.clone();
                let target_weights = weights.clone();
                let state_ref = state;
                
                async move {
                    if state_ref.is_cancelled.load(Ordering::Relaxed) {
                        return;
                    }

                    // 1. Load all fonts in the family once
                    let family_handle = match source.select_family_by_name(&family_name) {
                        Ok(h) => h,
                        Err(_) => {
                            progress_events::decrease_denominator(&app_handle, 1);
                            return;
                        }
                    };

                    let mut available_fonts = Vec::new();
                    let font_handles = family_handle.fonts();
                    
                    // Pre-calculate available weights string list for metadata
                    let weight_names: Vec<String> = font_handles.iter()
                        .filter_map(|h| h.load().ok())
                        .map(|f| format!("{:?}", f.properties().weight))
                        .collect();

                    for handle in font_handles {
                        if let Ok(font) = handle.load() {
                            if let Ok(meta) = FontRenderer::extract_meta(&font, weight_names.clone()) {
                                available_fonts.push((font, meta));
                            }
                        }
                    }

                    if available_fonts.is_empty() {
                        progress_events::decrease_denominator(&app_handle, target_weights.len() as i32);
                        return;
                    }

                    // 2. For each target weight, find the best match from already loaded fonts
                    for target_weight in target_weights {
                        if state_ref.is_cancelled.load(Ordering::Relaxed) {
                            return;
                        }

                        // Find closest weight
                        let (best_font, best_meta) = available_fonts.iter()
                            .min_by_key(|(_, m)| (m.actual_weight - target_weight).abs())
                            .unwrap(); // Won't panic since we checked is_empty

                        // Only render if it's reasonably close (same as previous logic)
                        if (best_meta.actual_weight - target_weight).abs() > 50 {
                            progress_events::decrease_denominator(&app_handle, 1);
                            continue;
                        }

                        // 3. Render and save
                        let _permit = sem.clone().acquire_owned().await.unwrap();
                        let renderer = FontRenderer::new(Arc::clone(&config), Arc::clone(&source));
                        
                        // We need to clone the metadata because FontMetadata doesn't implement Clone 
                        // and we use it in save_font_metadata.
                        // Actually, let's just re-pass the fields or make ExtractedMeta cloneable.
                        // Since ExtractedMeta is our internal struct, let's just manually "clone" it for simplicity here.
                        let meta_to_use = ExtractedMeta {
                            display_name: best_meta.display_name.clone(),
                            family_names: best_meta.family_names.clone(),
                            preferred_family_names: best_meta.preferred_family_names.clone(),
                            publishers: best_meta.publishers.clone(),
                            designers: best_meta.designers.clone(),
                            actual_weight: best_meta.actual_weight,
                            available_weights: best_meta.available_weights.clone(),
                        };

                        let res = renderer.render_and_save(best_font, &family_name, target_weight, meta_to_use);
                        
                        match res {
                            Ok(_) => progress_events::increase_numerator(&app_handle, 1),
                            _ => progress_events::decrease_denominator(&app_handle, 1),
                        }
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