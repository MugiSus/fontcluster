use crate::core::FontService;
use crate::rendering::FontRenderer;
use crate::config::{FontImageConfig, PREVIEW_TEXT};
use crate::error::FontResult;
use std::path::PathBuf;
use tokio::task;
use futures::future::join_all;
use std::sync::Arc;
use tokio::sync::Semaphore;
use font_kit::source::SystemSource;

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
        let semaphore = Arc::new(Semaphore::new(100)); // Max 20 concurrent tasks
        
        Ok(Self { 
            config, 
            weights, 
            shared_source,
            semaphore,
        })
    }
    
    pub async fn generate_all(&self) -> FontResult<PathBuf> {
        let font_families = FontService::get_system_fonts();
        
        // Individual font configs will be created during font processing
        let tasks = self.spawn_font_processing_tasks(font_families, self.weights.clone());
        join_all(tasks).await;
        
        Ok(self.config.output_dir.clone())
    }
    
    fn spawn_font_processing_tasks(
        &self,
        font_families: Vec<String>,
        weights: Vec<i32>,
    ) -> Vec<task::JoinHandle<()>> {
        font_families
            .into_iter()
            .flat_map(|family_name| {
                weights.iter().map(move |&weight| {
                    let family_name = family_name.clone();
                    let config_clone = self.config.clone();
                    let shared_source = Arc::clone(&self.shared_source);
                    let semaphore = Arc::clone(&self.semaphore);
                    
                    task::spawn(async move {
                        // Acquire semaphore permit to limit concurrency
                        let _permit = semaphore.acquire().await.unwrap();
                        
                        task::spawn_blocking(move || {
                            let renderer = FontRenderer::with_shared_source(&config_clone, shared_source);
                            if let Err(_e) = renderer.generate_font_image(&family_name, weight) {
                                // Skip silently - renderer handles logging
                            } else {
                                println!("Successfully generated image for font: {} weight: {}", family_name, weight);
                            }
                        }).await.unwrap();
                    })
                })
            })
            .collect()
    }
}