use crate::error::{Result, AppError};
use crate::core::AppState;
use crate::core::session::load_font_metadata;
use std::fs;
use fast_umap::UMAP;
use burn::backend::{Autodiff, Wgpu, wgpu::WgpuDevice};

pub struct Mapper;

impl Mapper {
    pub async fn map_all(state: &AppState) -> Result<()> {
        let session_dir = state.get_session_dir()?;
        let mut font_ids = Vec::new();
        let mut latents = Vec::new();

        let mut entries: Vec<_> = fs::read_dir(&session_dir)?.filter_map(|e| e.ok()).collect();
        entries.sort_by_key(|e| e.path());

        for entry in entries {
            let path = entry.path();
            if path.is_dir() {
                let id = path.file_name().unwrap().to_str().unwrap().to_string();
                if let Ok(meta) = load_font_metadata(&session_dir, &id) {
                    if let Some(computed) = meta.computed {
                        latents.push(computed.latent.iter().map(|&v| v as f64).collect::<Vec<f64>>());
                        font_ids.push(id);
                    }
                }
            }
        }

        if latents.is_empty() {
            return Err(AppError::Processing("No latent vectors found to map".into()));
        }

        let n_samples = latents.len();
        let n_features = latents[0].len();

        println!("✨ Running Mapping (fast-umap) ({} samples, {} features)...", n_samples, n_features);

        // UMAP execution using Wgpu for speed
        let device = WgpuDevice::default();
        let umap = UMAP::<Autodiff<Wgpu>>::fit(latents.clone(), device, 2);
        let embedding = umap.transform(latents);

        // Update metadata
        for (i, id) in font_ids.iter().enumerate() {
            let mut meta = load_font_metadata(&session_dir, id)?;
            if let Some(ref mut computed) = meta.computed {
                computed.vector = [embedding[i][0] as f32, embedding[i][1] as f32];
            }
            let font_dir = session_dir.join(id);
            fs::write(font_dir.join("meta.json"), serde_json::to_string_pretty(&meta)?)?;
        }

        state.update_status(|s| s.process_status = crate::config::ProcessStatus::Mapped)?;
        Ok(())
    }
}
