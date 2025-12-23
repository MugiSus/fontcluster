use crate::core::FontService;
use crate::rendering::FontRenderer;
use crate::config::{FontImageConfig, PREVIEW_TEXT};
use crate::error::FontResult;
use crate::commands::progress_commands::progress_events;
use std::path::PathBuf;
use tokio::task;
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
        // Limit concurrent font processing to prevent resource exhaustion
        // Dynamically scale based on CPU cores (available_parallelism * 2)
        let threads = std::thread::available_parallelism()
            .map(|n| n.get())
            .unwrap_or(8);
        let semaphore = Arc::new(Semaphore::new(threads * 2)); 
        println!("🚀 Initializing FontImageGenerator with concurrency: {}", threads * 2);
        
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
        
        use futures::StreamExt;
        
        // Process fonts concurrently with a limit, without waiting for full batches
        futures::stream::iter(all_task_params)
            .map(|(family_name, weight)| {
                let config_clone = self.config.clone();
                let shared_source = Arc::clone(&self.shared_source);
                let semaphore = Arc::clone(&self.semaphore);
                let app_handle_clone = app_handle.clone();
                
                async move {
                    // Acquire permit before spawning to avoid over-spawning threads
                    let _permit = semaphore.acquire_owned().await.unwrap();
                    
                    task::spawn_blocking(move || {
                        // Maintain the permit during execution
                        let _permit = _permit;
                        
                        let renderer = FontRenderer::with_shared_source(&config_clone, shared_source);
                        if let Err(_e) = renderer.generate_font_image(&family_name, weight) {
                            // Decrement denominator for failed tasks
                            progress_events::decrement_progress_denominator(&app_handle_clone);
                        } else {
                            println!("Successfully generated image for font: {} weight: {}", family_name, weight);
                            // Increment progress after successful completion
                            progress_events::increment_progress(&app_handle_clone);
                        }
                    }).await
                }
            })
            .buffer_unordered(BATCH_SIZE) // Use BATCH_SIZE as the number of concurrent futures
            .collect::<Vec<_>>()
            .await;
        
        Ok(self.config.output_dir.clone())
    }
    
}