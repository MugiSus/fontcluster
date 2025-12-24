use crate::config::{RenderConfig, DEFAULT_FONT_SIZE};
use crate::error::Result;
use crate::rendering::FontRenderer;
use crate::core::AppState;
use std::sync::Arc;
use tokio::sync::Semaphore;
use font_kit::source::SystemSource;
use tauri::AppHandle;
use crate::commands::progress::progress_events;
use futures::StreamExt;

pub struct ImageGenerator {
    source: Arc<SystemSource>,
    semaphore: Arc<Semaphore>,
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
        let (text, weights) = {
            let guard = state.current_session.lock().unwrap();
            let s = guard.as_ref().unwrap();
            (s.preview_text.clone(), s.weights.clone())
        };

        let families: Vec<String> = self.source.all_families()
            .unwrap_or_default()
            .into_iter()
            .filter(|f| !f.to_lowercase().contains("emoji") && !f.to_lowercase().contains("icon"))
            .collect();

        let mut tasks = Vec::new();
        for family in families {
            for &weight in &weights {
                tasks.push((family.clone(), weight));
            }
        }

        progress_events::reset_progress(app);
        progress_events::set_progress_denominator(app, tasks.len() as i32);

        let render_config = Arc::new(RenderConfig {
            text,
            font_size: DEFAULT_FONT_SIZE,
            output_dir: session_dir,
        });

        futures::stream::iter(tasks)
            .map(|(family, weight)| {
                let config = Arc::clone(&render_config);
                let source = Arc::clone(&self.source);
                let sem = Arc::clone(&self.semaphore);
                let app_handle = app.clone();
                
                async move {
                    let _permit = sem.acquire_owned().await.unwrap();
                    let res = tokio::task::spawn_blocking(move || {
                        let renderer = FontRenderer::new(config, source);
                        renderer.render(&family, weight)
                    }).await;
                    
                    match res {
                        Ok(Ok(_)) => progress_events::increment_progress(&app_handle),
                        _ => progress_events::decrement_progress_denominator(&app_handle),
                    }
                }
            })
            .buffer_unordered(128)
            .collect::<Vec<_>>()
            .await;

        state.update_status(|s| s.has_images = true)?;
        Ok(())
    }
}