use crate::error::{Result, AppError};
use crate::core::AppState;
use crate::core::session::load_font_metadata;
use std::fs;
use linfa::prelude::*;
use linfa_reduction::Pca;
// Use ndarray 0.15 to match linfa-reduction's expectations
use ndarray015::Array2;

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
                        latents.extend(computed.latent.iter().map(|&v| v as f32));
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

        println!("✨ Running Mapping (PCA via linfa) ({} samples, {} features)...", n_samples, n_features);

        let embedding = tokio::task::spawn_blocking(move || {
            let mut array = Array2::from_shape_vec((n_samples, n_features), latents)
                .map_err(|e| AppError::Processing(e.to_string()))?;
            
            // 1. Standardize the data (Z-score normalization)
            // PCA in linfa centers the data, but scaling the variance to 1 often helps.
            for mut col in array.columns_mut() {
                let n = col.len() as f32;
                if n < 2.0 { continue; }
                
                let mean = col.sum() / n;
                let variance = col.iter().map(|&x| (x - mean).powi(2)).sum::<f32>() / (n - 1.0);
                let std = variance.sqrt().max(1e-6);
                
                col.mapv_inplace(|x| (x - mean) / std);
            }

            // PCA in linfa works with f64. Convert array to f64.
            let array_f64 = array.mapv(|x| x as f64);
            
            // Convert to linfa dataset
            let dataset = Dataset::from(array_f64);
            
            // Train PCA model for 2 components
            let pca = Pca::params(2)
                .fit(&dataset)
                .map_err(|e| AppError::Processing(format!("PCA fit failed: {:?}", e)))?;
            
            // Transform data
            let projected = pca.predict(dataset);
            
            // Convert back to f32
            let records_f32 = projected.records.mapv(|x| x as f32);
            
            Ok::<Array2<f32>, AppError>(records_f32)
        }).await.map_err(|e| AppError::Processing(e.to_string()))??;

        // Update metadata
        for (i, id) in font_ids.iter().enumerate() {
            let mut meta = load_font_metadata(&session_dir, id)?;
            if let Some(ref mut computed) = meta.computed {
                computed.vector = [embedding[[i, 0]], embedding[[i, 1]]];
            }
            let font_dir = session_dir.join(id);
            fs::write(font_dir.join("meta.json"), serde_json::to_string_pretty(&meta)?)?;
        }

        state.update_status(|s| s.process_status = crate::config::ProcessStatus::Mapped)?;
        Ok(())
    }
}
