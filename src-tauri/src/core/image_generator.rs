use crate::core::FontService;
use crate::rendering::FontRenderer;
use crate::config::{FontImageConfig, PREVIEW_TEXT};
use crate::error::FontResult;
use std::path::PathBuf;
use tokio::task;
use futures::future::join_all;

// Main font image generation orchestrator
pub struct FontImageGenerator {
    config: FontImageConfig,
    weights: Vec<i32>,
}

impl FontImageGenerator {
    pub fn new(text: Option<String>, font_size: f32, weights: Vec<i32>) -> FontResult<Self> {
        let config = FontImageConfig {
            text: text.unwrap_or_else(|| PREVIEW_TEXT.to_string()),
            font_size,
            output_dir: FontService::create_output_directory()?,
        };
        
        Ok(Self { config, weights })
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
                    
                    task::spawn_blocking(move || {
                        let renderer = FontRenderer::new(&config_clone);
                        if let Err(_e) = renderer.generate_font_image(&family_name, weight) {
                            // Skip silently - renderer handles logging
                        } else {
                            println!("Successfully generated image for font: {} weight: {}", family_name, weight);
                        }
                    })
                })
            })
            .collect()
    }
}