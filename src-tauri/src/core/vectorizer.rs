use crate::error::Result;
use crate::core::AppState;
use crate::commands::progress::progress_events;
use std::path::PathBuf;
use std::sync::atomic::Ordering;
use tauri::AppHandle;
use ort::{session::Session, inputs};
use ndarray::Array4;

pub struct Vectorizer {
    session: Session,
}

impl Vectorizer {
    pub fn new() -> Result<Self> {
        let mut model_path = std::env::current_dir()?.join("src-tauri/src/resources/resnet50.onnx");
        if !model_path.exists() {
            model_path = std::env::current_dir()?.join("src/resources/resnet50.onnx");
        }
        
        println!("🔍 Vectorizer: Loading model from: {:?}", model_path);
        
        if let Ok(metadata) = std::fs::metadata(&model_path) {
            println!("🔍 Vectorizer: Model file size: {} bytes", metadata.len());
        } else {
            println!("❌ Vectorizer: Could not get metadata for model file");
        }

        println!("🔍 Vectorizer: Creating ORT environment/builder...");
        let builder = Session::builder()
            .map_err(|e| crate::error::AppError::Processing(format!("Failed to create builder: {}", e)))?;
        
        println!("🔍 Vectorizer: Committing model from file...");
        let session = builder.commit_from_file(model_path)
            .map_err(|e| crate::error::AppError::Processing(format!("Failed to load model: {}", e)))?;
        
        println!("✅ Vectorizer: Model loaded successfully");
        Ok(Self { session })
    }

    pub async fn vectorize_all(&mut self, app: &AppHandle, state: &AppState) -> Result<()> {
        let session_dir = state.get_session_dir()?;
        let _image_config = {
            let guard = state.current_session.lock().map_err(|_| crate::error::AppError::Processing("Lock poisoned".into()))?;
            guard.as_ref()
                .and_then(|s| s.algorithm.as_ref())
                .and_then(|a| a.image.clone())
                .unwrap_or_default()
        };

        let mut png_files = Vec::new();
        for entry in jwalk::WalkDir::new(&session_dir)
            .into_iter()
            .filter_map(|e| e.ok()) {
            if entry.file_type().is_file() && entry.file_name() == "sample.png" {
                png_files.push(entry.path());
            }
        }

        println!("🔍 Vectorizer: Found {} images to process", png_files.len());
        if png_files.is_empty() {
            println!("⚠️ Vectorizer: No images found in {}", session_dir.display());
            return Ok(());
        }

        progress_events::reset_progress(app);
        progress_events::set_progress_denominator(app, png_files.len() as i32);

        png_files.into_iter().for_each(|path| {
            if state.is_cancelled.load(Ordering::Relaxed) {
                return;
            }
            let res = self.process_image(path.clone());
            match res {
                Ok(_) => {
                    progress_events::increase_numerator(app, 1);
                }
                Err(e) => {
                    println!("❌ Vectorization failed for {:?}: {}", path, e);
                    progress_events::decrease_denominator(app, 1);
                }
            }
        });

        if state.is_cancelled.load(Ordering::Relaxed) {
            return Ok(());
        }

        state.update_status(|s| s.process_status = crate::config::ProcessStatus::Vectorized)?;
        Ok(())
    }

    fn process_image(&mut self, path: PathBuf) -> Result<()> {
        let img = image::open(&path).map_err(|e| crate::error::AppError::Image(e.to_string()))?.to_rgb8();
        // Resize to 224x224 as required by ResNet-50
        let resized = image::imageops::resize(&img, 224, 224, image::imageops::FilterType::Lanczos3);
        
        // Normalize: (pixel / 255.0 - mean) / std
        // ImageNet mean: [0.485, 0.456, 0.406], std: [0.229, 0.224, 0.225]
        let mut input = Array4::<f32>::zeros((1, 3, 224, 224));
        for (x, y, pixel) in resized.enumerate_pixels() {
            let r = (pixel[0] as f32 / 255.0 - 0.485) / 0.229;
            let g = (pixel[1] as f32 / 255.0 - 0.456) / 0.224;
            let b = (pixel[2] as f32 / 255.0 - 0.406) / 0.225;
            input[[0, 0, y as usize, x as usize]] = r;
            input[[0, 1, y as usize, x as usize]] = g;
            input[[0, 2, y as usize, x as usize]] = b;
        }

        let input_tensor = ort::value::Value::from_array(([1, 3, 224, 224], input.into_raw_vec_and_offset().0))
            .map_err(|e| crate::error::AppError::Processing(e.to_string()))?;

        let outputs = self.session.run(inputs![input_tensor])
            .map_err(|e| crate::error::AppError::Processing(e.to_string()))?;
        
        let output = outputs.values().next()
            .ok_or_else(|| crate::error::AppError::Processing("No output from model".into()))?;
        
        let tensor = output.try_extract_tensor::<f32>()
            .map_err(|e| crate::error::AppError::Processing(e.to_string()))?;
        
        let features: Vec<f32> = tensor.1.to_vec();
        
        let mut bin_path = path;
        bin_path.set_file_name("vector.bin");
        std::fs::write(bin_path, bytemuck::cast_slice(&features))?;
        Ok(())
    }
}
