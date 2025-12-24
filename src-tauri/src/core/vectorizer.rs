use crate::error::Result;
use crate::core::AppState;
use crate::commands::progress::progress_events;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::Semaphore;
use tauri::AppHandle;
use futures::StreamExt;
use imageproc::hog::{hog, HogOptions};
use bytemuck;

pub struct Vectorizer {
    semaphore: Arc<Semaphore>,
}

impl Vectorizer {
    pub fn new() -> Self {
        let threads = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(8);
        Self { semaphore: Arc::new(Semaphore::new(threads * 2)) }
    }

    pub async fn vectorize_all(&self, app: &AppHandle, state: &AppState) -> Result<()> {
        let session_dir = state.get_session_dir()?;
        let mut png_files = Vec::new();
        for entry in std::fs::read_dir(&session_dir)? {
            let path = entry?.path();
            if path.is_dir() {
                let png = path.join("sample.png");
                if png.exists() { png_files.push(png); }
            }
        }

        progress_events::reset_progress(app);
        progress_events::set_progress_denominator(app, png_files.len() as i32);

        futures::stream::iter(png_files)
            .map(|path| {
                let sem = Arc::clone(&self.semaphore);
                let app_handle = app.clone();
                async move {
                    let _permit = sem.acquire_owned().await.unwrap();
                    let res = tokio::task::spawn_blocking(move || Self::process_image(path)).await;
                    match res {
                        Ok(Ok(_)) => progress_events::increment_progress(&app_handle),
                        _ => progress_events::decrement_progress_denominator(&app_handle),
                    }
                }
            })
            .buffer_unordered(64)
            .collect::<Vec<_>>()
            .await;

        state.update_status(|s| s.has_vectors = true)?;
        Ok(())
    }

    fn process_image(path: PathBuf) -> Result<()> {
        let img = image::open(&path).map_err(|e| crate::error::AppError::Image(e.to_string()))?.to_luma8();
        let resized = image::imageops::resize(&img, 512, 128, image::imageops::FilterType::Lanczos3);
        let opts = HogOptions { orientations: 4, cell_side: 16, block_side: 2, block_stride: 2, signed: false };
        let features = hog(&resized, opts).map_err(|e| crate::error::AppError::Processing(e.to_string()))?;
        
        let mut bin_path = path;
        bin_path.set_file_name("vector.bin");
        std::fs::write(bin_path, bytemuck::cast_slice(&features))?;
        Ok(())
    }
}
