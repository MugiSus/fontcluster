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
        // Get pre-validated font-weight pairs that are guaranteed to work
        progress_events::reset_progress(app_handle);
        progress_events::set_progress_denominator(app_handle, 0);
        let font_weight_pairs = FontService::get_validated_font_weight_pairs(&self.shared_source, &self.weights);
        
        // Calculate total tasks and reset progress
        let total_tasks = font_weight_pairs.len();
        progress_events::set_progress_denominator(app_handle, total_tasks as i32);
        
        if font_weight_pairs.is_empty() {
            println!("⚠️  No valid font-weight pairs found for weights: {:?}", self.weights);
            return Ok(self.config.output_dir.clone());
        }
        
        // Process fonts in batches to prevent memory exhaustion
        // This maintains the same behavior but reduces peak memory usage
        const BATCH_SIZE: usize = 128; // Process 128 tasks at a time

        // Process validated pairs in batches
        let total_batches = (total_tasks + BATCH_SIZE - 1) / BATCH_SIZE;
        println!("🚀 Processing {} pre-validated font-weight pairs in {} batches", 
                total_tasks, total_batches);
        
        // Process pairs in chunks
        for (batch_idx, pair_chunk) in font_weight_pairs.chunks(BATCH_SIZE).enumerate() {
            let batch_tasks: Vec<_> = pair_chunk.iter()
                .map(|pair| {
                    let config_clone = self.config.clone();
                    let shared_source = Arc::clone(&self.shared_source);
                    let semaphore = Arc::clone(&self.semaphore);
                    let app_handle_clone = app_handle.clone();
                    let pair = pair.clone();
                    
                    task::spawn_blocking(move || {
                        // Acquire permit before processing (blocking)
                        let rt = tokio::runtime::Handle::current();
                        let _permit = rt.block_on(semaphore.acquire()).unwrap();
                        
                        let renderer = FontRenderer::with_shared_source(&config_clone, shared_source);
                        // Use the pre-validated weight - no need for weight checking!
                        if let Err(_e) = renderer.generate_font_image(&pair.family_name, pair.actual_weight) {
                            // This should rarely happen since we pre-validated
                            progress_events::decrement_progress_denominator(&app_handle_clone);
                        } else {
                            println!("✅ Generated: {} weight {} (validated)", pair.family_name, pair.actual_weight);
                            progress_events::increment_progress(&app_handle_clone);
                        }
                    })
                })
                .collect();
            
            println!("🔄 Processing batch {}/{} ({} tasks)", batch_idx + 1, total_batches, batch_tasks.len());
            
            // Wait for this batch to complete before starting the next
            join_all(batch_tasks).await;
        }
        
        Ok(self.config.output_dir.clone())
    }
    
}