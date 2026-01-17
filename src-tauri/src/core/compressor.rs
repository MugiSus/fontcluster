use crate::error::{Result, AppError};
use crate::core::AppState;
use crate::core::session::load_font_metadata;
use crate::core::burn_model::{ModelConfig, Model};
use burn::tensor::Tensor;
use burn::optim::{AdamConfig, Optimizer, GradientsParams};
use burn::module::AutodiffModule;
use std::fs;

pub struct Compressor;

impl Compressor {
    pub async fn compress_all(app: &tauri::AppHandle, state: &AppState) -> Result<()> {
        let session_dir = state.get_session_dir()?;
        let mut image_paths = Vec::new();
        let mut font_ids = Vec::new();

        let mut entries: Vec<_> = fs::read_dir(&session_dir)?.filter_map(|e| e.ok()).collect();
        entries.sort_by_key(|e| e.path());

        for entry in entries {
            let path = entry.path();
            if path.is_dir() {
                let sample_path = path.join("sample.png");
                if sample_path.exists() {
                    image_paths.push(sample_path);
                    font_ids.push(path.file_name().unwrap().to_str().unwrap().to_string());
                }
            }
        }

        if image_paths.is_empty() { return Err(AppError::Processing("No images to compress".into())); }

        let config = {
            let guard = state.current_session.lock().map_err(|_| AppError::Processing("Lock poisoned".into()))?;
            guard.as_ref()
                .and_then(|s| s.algorithm.as_ref())
                .and_then(|a| a.autoencoder.clone())
                .unwrap_or_default()
        };

        // For now, let's use NdArray for simplicity.
        // For training, we need an Autodiff backend.
        // For training, we need an Autodiff backend.
        // Using Wgpu for hardware acceleration on Mac (Metal)
        type B = burn::backend::Wgpu;
        type AD = burn::backend::Autodiff<B>;
        let device = burn::backend::wgpu::WgpuDevice::default();

        let model_config = ModelConfig::new(config.latent_dim as usize);
        let model: Model<AD> = model_config.init(&device);

        // Load images into a single tensor [N, 1, 128, 128]
        let mut tensors = Vec::new();
        for path in &image_paths {
            let img = image::open(path).map_err(|e| AppError::Image(e.to_string()))?.to_luma8();
            // Resize to 128x128 if not already
            let resized = if img.width() != 128 || img.height() != 128 {
                image::imageops::resize(&img, 128, 128, image::imageops::FilterType::Lanczos3)
            } else {
                img
            };
            let data: Vec<f32> = resized.pixels().map(|p| p[0] as f32 / 255.0).collect();
            // Use B::Device for tensor creation
            let tensor = Tensor::<B, 1>::from_floats(data.as_slice(), &device)
                .reshape([1, 1, 128, 128]);
            tensors.push(tensor);
        }
        let batch_input = Tensor::cat(tensors, 0);
        let batch_input_ad = Tensor::<AD, 4>::from_inner(batch_input.clone());

        println!("🚀 Training Autoencoder ({} fonts, {} epochs)...", font_ids.len(), config.epochs);
        println!("🔧 Backend: Wgpu (Metal/Vulkan/DX12)");
        
        use crate::commands::progress::progress_events;
        progress_events::reset_progress(app);
        progress_events::set_progress_denominator(app, config.epochs as i32);

        let app_handle = app.clone();
        let is_cancelled = state.is_cancelled.clone();
        let epochs = config.epochs;
        let learning_rate = config.learning_rate;
        let (model, cancelled) = tokio::task::spawn_blocking(move || {
            println!("🚄 Starting training loop in background thread...");
            let mut optim = AdamConfig::new().init();
            let mut current_model = model;
            
            for epoch in 1..=epochs {
                if is_cancelled.load(std::sync::atomic::Ordering::Relaxed) {
                    println!("🛑 Training cancelled at epoch {}", epoch);
                    break;
                }

                if epoch == 1 {
                    println!("🔄 Epoch 1: Starting first forward pass...");
                }

                let output = current_model.forward(batch_input_ad.clone());
                let loss = burn::nn::loss::MseLoss::new().forward(output, batch_input_ad.clone(), burn::nn::loss::Reduction::Mean);
                
                let loss_val = loss.clone().into_data().iter::<f32>().next().unwrap_or(0.0);
                if epoch % 1 == 0 { // Log every epoch for better visibility
                    println!("Epoch {:3}/{:3} - Loss: {:.6}", epoch, epochs, loss_val);
                    progress_events::increase_numerator(&app_handle, 1);
                }

                let grads = loss.backward();
                let grads = GradientsParams::from_grads(grads, &current_model);
                current_model = optim.step(learning_rate, current_model, grads);
            }
            (current_model, is_cancelled.load(std::sync::atomic::Ordering::Relaxed))
        }).await.map_err(|e| AppError::Processing(e.to_string()))?;

        if cancelled {
            return Ok(());
        }

        // Get latent vectors (inference doesn't need autodiff, but we can reuse the model)
        let model_valid = model.valid();
        let latent = model_valid.encode(batch_input);
        let latent_vecs: Vec<f32> = latent.into_data().iter::<f32>().collect();
        
        for (i, id) in font_ids.iter().enumerate() {
            let mut meta = load_font_metadata(&session_dir, id)?;
            let k = meta.computed.as_ref().map(|c| c.k).unwrap_or(-1);
            
            let idx = i * config.latent_dim;
            meta.computed = Some(crate::config::ComputedData {
                vector: [latent_vecs[idx], latent_vecs[idx+1]], // Assumes latent_dim=2
                k,
            });
            let font_dir = session_dir.join(id);
            fs::write(font_dir.join("meta.json"), serde_json::to_string_pretty(&meta)?)?;
        }

        state.update_status(|s| s.process_status = crate::config::ProcessStatus::Compressed)?;
        Ok(())
    }
}