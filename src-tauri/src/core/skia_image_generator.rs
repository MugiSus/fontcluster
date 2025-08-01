use crate::core::FontService;
use crate::rendering::SkiaFontRenderer;
use crate::config::{FontImageConfig, PREVIEW_TEXT};
use crate::error::FontResult;
use crate::commands::progress_commands::progress_events;
use std::path::PathBuf;
use tokio::task;
use futures::future::join_all;
use std::sync::Arc;
use tokio::sync::Semaphore;
use font_kit::source::SystemSource;
use tauri::AppHandle;

/// GPU-accelerated font image generation using Skia
pub struct SkiaImageGenerator {
    config: FontImageConfig,
    weights: Vec<i32>,
    shared_source: Arc<SystemSource>,
    semaphore: Arc<Semaphore>,
}

impl SkiaImageGenerator {
    pub fn new(text: Option<String>, font_size: f32, weights: Vec<i32>) -> FontResult<Self> {
        let config = FontImageConfig {
            text: text.unwrap_or_else(|| PREVIEW_TEXT.to_string()),
            font_size,
            output_dir: FontService::create_output_directory()?,
        };
        
        // Create shared SystemSource once for all tasks
        let shared_source = Arc::new(SystemSource::new());
        // Concurrent tasks (can be increased when GPU is enabled)
        #[cfg(feature = "gpu")]
        let semaphore = Arc::new(Semaphore::new(32)); // Max 32 concurrent GPU tasks
        #[cfg(not(feature = "gpu"))]
        let semaphore = Arc::new(Semaphore::new(16)); // Max 16 concurrent CPU tasks
        
        Ok(Self { 
            config, 
            weights, 
            shared_source,
            semaphore,
        })
    }
    
    pub async fn generate_all(&self, app_handle: &AppHandle) -> FontResult<PathBuf> {
        let font_families = FontService::get_system_fonts_with_source(&self.shared_source);
        
        // Calculate total tasks and reset progress
        let total_tasks = font_families.len() * self.weights.len();
        progress_events::reset_progress(app_handle);
        progress_events::set_progress_denominator(app_handle, total_tasks as i32);
        
        // Process fonts in batches (size depends on GPU availability)
        #[cfg(feature = "gpu")]
        const BATCH_SIZE: usize = 500; // GPU can handle larger batches
        #[cfg(not(feature = "gpu"))]
        const BATCH_SIZE: usize = 200; // CPU batch size
        
        // Create all task combinations
        let mut all_task_params = Vec::new();
        for family_name in font_families {
            for &weight in &self.weights {
                all_task_params.push((family_name.clone(), weight));
            }
        }
        
        #[cfg(feature = "gpu")]
        println!("🎨 Starting Skia GPU font rendering for {} tasks", all_task_params.len());
        #[cfg(not(feature = "gpu"))]
        println!("🎨 Starting Skia CPU font rendering for {} tasks", all_task_params.len());
        
        // Process in batches
        for (batch_idx, batch) in all_task_params.chunks(BATCH_SIZE).enumerate() {
            #[cfg(feature = "gpu")]
            println!("🚀 Processing GPU batch {}/{} ({} fonts)", 
                batch_idx + 1, 
                (all_task_params.len() + BATCH_SIZE - 1) / BATCH_SIZE,
                batch.len()
            );
            #[cfg(not(feature = "gpu"))]
            println!("🚀 Processing CPU batch {}/{} ({} fonts)", 
                batch_idx + 1, 
                (all_task_params.len() + BATCH_SIZE - 1) / BATCH_SIZE,
                batch.len()
            );
            
            let batch_tasks = batch.iter()
                .map(|(family_name, weight)| {
                    let config_clone = self.config.clone();
                    let _shared_source = Arc::clone(&self.shared_source);
                    let semaphore = Arc::clone(&self.semaphore);
                    let app_handle_clone = app_handle.clone();
                    let family_name = family_name.clone();
                    let weight = *weight;
                    
                    task::spawn_blocking(move || {
                        // Acquire permit before processing (blocking)
                        let rt = tokio::runtime::Handle::current();
                        let _permit = rt.block_on(semaphore.acquire()).unwrap();
                        
                        // Use Skia renderer (CPU for now, GPU-ready architecture)
                        let mut renderer = match SkiaFontRenderer::new(&config_clone) {
                            Ok(renderer) => renderer,
                            Err(e) => {
                                eprintln!("Failed to create Skia renderer: {}", e);
                                progress_events::decrement_progress_denominator(&app_handle_clone);
                                return;
                            }
                        };
                        
                        if let Err(_e) = renderer.generate_font_image(&family_name, weight) {
                            // Skip silently - renderer handles logging
                            // Decrement denominator for failed tasks to keep progress accurate
                            progress_events::decrement_progress_denominator(&app_handle_clone);
                        } else {
                            #[cfg(feature = "gpu")]
                            println!("✅ GPU rendered font: {} weight: {}", family_name, weight);
                            #[cfg(not(feature = "gpu"))]
                            println!("✅ CPU rendered font: {} weight: {}", family_name, weight);
                            // Increment progress after successful completion
                            progress_events::increment_progress(&app_handle_clone);
                        }
                    })
                })
                .collect::<Vec<_>>();
                
            // Wait for this batch to complete before starting the next
            join_all(batch_tasks).await;
        }
        
        #[cfg(feature = "gpu")]
        println!("🎉 Skia GPU font rendering completed");
        #[cfg(not(feature = "gpu"))]
        println!("🎉 Skia CPU font rendering completed");
        Ok(self.config.output_dir.clone())
    }
}