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
        let semaphore = Arc::new(Semaphore::new(16)); // Max 16 concurrent tasks
        
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
        
        // Individual font configs will be created during font processing
        let tasks = self.spawn_font_processing_tasks(font_families, self.weights.clone(), app_handle);
        join_all(tasks).await;
        
        Ok(self.config.output_dir.clone())
    }
    
    fn spawn_font_processing_tasks(
        &self,
        font_families: Vec<String>,
        weights: Vec<i32>,
        app_handle: &AppHandle,
    ) -> Vec<task::JoinHandle<()>> {
        // Create all tasks first (without spawning them)
        let all_tasks: Vec<_> = font_families
            .into_iter()
            .flat_map(|family_name| {
                weights.iter().map(move |&weight| (family_name.clone(), weight))
            })
            .collect();

        // Process tasks in controlled batches using semaphore
        all_tasks
            .into_iter()
            .map(|(family_name, weight)| {
                let config_clone = self.config.clone();
                let shared_source = Arc::clone(&self.shared_source);
                let semaphore = Arc::clone(&self.semaphore);
                let app_handle_clone = app_handle.clone();
                
                task::spawn_blocking(move || {
                    // Acquire permit before processing (blocking)
                    let rt = tokio::runtime::Handle::current();
                    let _permit = rt.block_on(semaphore.acquire()).unwrap();
                    
                    let renderer = FontRenderer::with_shared_source(&config_clone, shared_source);
                    if let Err(_e) = renderer.generate_font_image(&family_name, weight) {
                        // Skip silently - renderer handles logging
                        // Decrement denominator for failed tasks to keep progress accurate
                        progress_events::decrement_progress_denominator(&app_handle_clone);
                    } else {
                        println!("Successfully generated image for font: {} weight: {}", family_name, weight);
                        // Increment progress after successful completion
                        progress_events::increment_progress(&app_handle_clone);
                    }
                })
            })
            .collect()
    }
}