use crate::error::{Result, AppError};
use crate::core::AppState;
use crate::core::session::load_font_metadata;
use std::fs;
use nalgebra::DMatrix;

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
                        latents.extend(computed.latent.iter().map(|&v| v as f64));
                        font_ids.push(id);
                    }
                }
            }
        }

        if font_ids.is_empty() {
            return Err(AppError::Processing("No latent vectors found to map".into()));
        }

        let n_samples = font_ids.len();
        let n_features = latents.len() / n_samples;

        println!("✨ Running Mapping (PCA) ({} samples, {} features)...", n_samples, n_features);

        let embedding = tokio::task::spawn_blocking(move || {
            let matrix = DMatrix::from_vec(n_samples, n_features, latents);
            
            // 1. Center the data
            let mut centered = matrix;
            for mut col in centered.column_iter_mut() {
                let mean = col.mean();
                col.add_scalar_mut(-mean);
            }

            // 2. SVD (Singular Value Decomposition)
            // We want the first 2 principal components.
            // X = U * S * V^T
            // The rows of V^T (or columns of V) are the principal components.
            let svd = centered.clone().svd(false, true);
            let v_t = svd.v_t.ok_or_else(|| AppError::Processing("SVD failed: no V^T matrix".into()))?;
            
            // 3. Project data onto the first 2 principal components
            // Projected = Centered * V[:, :2]
            // Since we have V^T, V[:, :2] corresponds to the first two rows of V^T transposed.
            let principal_components = v_t.rows(0, 2).transpose();
            let projected = centered * principal_components;
            
            Ok::<DMatrix<f64>, AppError>(projected)
        }).await.map_err(|e| AppError::Processing(e.to_string()))??;

        // Update metadata
        for (i, id) in font_ids.iter().enumerate() {
            let mut meta = load_font_metadata(&session_dir, id)?;
            if let Some(ref mut computed) = meta.computed {
                computed.vector = [embedding[(i, 0)] as f32, embedding[(i, 1)] as f32];
            }
            let font_dir = session_dir.join(id);
            fs::write(font_dir.join("meta.json"), serde_json::to_string_pretty(&meta)?)?;
        }

        state.update_status(|s| s.process_status = crate::config::ProcessStatus::Mapped)?;
        Ok(())
    }
}
