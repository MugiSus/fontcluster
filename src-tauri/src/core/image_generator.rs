use crate::core::FontService;
use crate::rendering::FontRenderer;
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

// Main font image generation orchestrator
pub struct FontImageGenerator {
    config: FontImageConfig,
    weights: Vec<i32>,
    shared_source: Arc<SystemSource>,
    semaphore: Arc<Semaphore>,
}

impl FontImageGenerator {
    pub fn new(text: Option<String>, font_size: f32, weights: Vec<i32>) -> FontResult<Self> {
        let config = FontImageConfig {
            text: text.unwrap_or_else(|| PREVIEW_TEXT.to_string()),
            font_size,
            output_dir: FontService::create_output_directory()?,
        };
        
        // Create shared SystemSource once for all tasks
        let shared_source = Arc::new(SystemSource::new());
        // Limit concurrent font processing to prevent resource exhaustion (CPU cores * 2)
        let semaphore = Arc::new(Semaphore::new(50)); // Max 50 concurrent tasks
        
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
        
        // Process fonts in batches to prevent memory exhaustion
        // This maintains the same behavior but reduces peak memory usage
        const BATCH_SIZE: usize = 128; // Process 128 tasks at a time

        // Create all task combinations
        let mut all_task_params = Vec::new();
        for family_name in font_families {
            for &weight in &self.weights {
                all_task_params.push((family_name.clone(), weight));
            }
        }
        
        // Process in batches with the same logic as before
        for batch in all_task_params.chunks(BATCH_SIZE) {
            let batch_tasks = batch.iter()
                .map(|(family_name, weight)| {
                    let config_clone = self.config.clone();
                    let shared_source = Arc::clone(&self.shared_source);
                    let semaphore = Arc::clone(&self.semaphore);
                    let app_handle_clone = app_handle.clone();
                    let family_name = family_name.clone();
                    let weight = *weight;
                    
                    task::spawn_blocking(move || {
                        // Acquire permit before processing (blocking)
                        let rt = tokio::runtime::Handle::current();
                        let _permit = rt.block_on(semaphore.acquire()).unwrap();
                        
                        let renderer = FontRenderer::with_shared_source(&config_clone, shared_source);
                        if let Err(_e) = renderer.generate_font_image(&family_name, weight) {
                            // Decrement denominator for failed tasks
                            progress_events::decrement_progress_denominator(&app_handle_clone);
                        } else {
                            println!("Successfully generated image for font: {} weight: {}", family_name, weight);
                            // Increment progress after successful completion
                            progress_events::increment_progress(&app_handle_clone);
                        }
                    })
                })
                .collect::<Vec<_>>();
                
            // Wait for this batch to complete before starting the next
            join_all(batch_tasks).await;
        }
        
        Ok(self.config.output_dir.clone())
    }
    
}