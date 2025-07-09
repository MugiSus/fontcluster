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
}

impl FontImageGenerator {
    pub fn new(text: Option<String>, font_size: f32) -> FontResult<Self> {
        let config = FontImageConfig {
            text: text.unwrap_or_else(|| PREVIEW_TEXT.to_string()),
            font_size,
            output_dir: FontService::create_output_directory()?,
        };
        
        Ok(Self { config })
    }
    
    pub async fn generate_all(&self) -> FontResult<PathBuf> {
        let font_families = FontService::get_system_fonts();
        
        let tasks = self.spawn_font_processing_tasks(font_families);
        join_all(tasks).await;
        
        Ok(self.config.output_dir.clone())
    }
    
    fn spawn_font_processing_tasks(
        &self,
        font_families: Vec<String>,
    ) -> Vec<task::JoinHandle<()>> {
        font_families
            .into_iter()
            .map(|family_name| {
                let config_clone = self.config.clone();
                
                task::spawn_blocking(move || {
                    let renderer = FontRenderer::new(&config_clone);
                    if let Err(e) = renderer.generate_font_image(&family_name) {
                        println!("Skipping font '{}' due to rendering error: {}", family_name, e);
                    }
                })
            })
            .collect()
    }
}