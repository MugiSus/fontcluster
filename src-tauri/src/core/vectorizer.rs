use crate::error::Result;
use crate::core::AppState;
use crate::commands::progress::progress_events;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::sync::atomic::Ordering;
use tauri::AppHandle;
use ort::{session::Session, inputs};
use ort::execution_providers::CoreMLExecutionProvider;
use ndarray::Array4;
use tokio::sync::mpsc;

#[derive(Clone)]
pub struct Vectorizer {
    session: Arc<Mutex<Session>>,
}

impl Vectorizer {
    pub fn new() -> Result<Self> {
        let mut model_path = std::env::current_dir()?.join("src-tauri/src/resources/resnet50.onnx");
        if !model_path.exists() {
            model_path = std::env::current_dir()?.join("src/resources/resnet50.onnx");
        }
        
        // Use CoreML for extreme performance on Mac (ANE/GPU)
        let session = Session::builder()
            .map_err(|e| crate::error::AppError::Processing(format!("Failed to create builder: {}", e)))?
            .with_execution_providers([CoreMLExecutionProvider::default().build()])
            .map_err(|e| crate::error::AppError::Processing(format!("Failed to set CoreML: {}", e)))?
            .commit_from_file(model_path)
            .map_err(|e| crate::error::AppError::Processing(format!("Failed to load model: {}", e)))?;
        
        Ok(Self { session: Arc::new(Mutex::new(session)) })
    }

    pub async fn vectorize_all(&self, app: &AppHandle, state: &AppState) -> Result<()> {
        let session_dir = state.get_session_dir()?;
        let png_files: Vec<PathBuf> = jwalk::WalkDir::new(&session_dir)
            .into_iter()
            .filter_map(|e| e.ok())
            .filter(|entry| entry.file_type().is_file() && entry.file_name() == "sample.png")
            .map(|e| e.path())
            .collect();

        if png_files.is_empty() {
            return Ok(());
        }

        progress_events::reset_progress(app);
        progress_events::set_progress_denominator(app, png_files.len() as i32);

        let (tensor_tx, mut tensor_rx) = mpsc::channel::<(PathBuf, Array4<f32>)>(64);
        let (save_tx, mut save_rx) = mpsc::channel::<(PathBuf, Vec<f32>)>(128);

        let app_handle = app.clone();
        let state_clone = state.clone();
        let self_clone = self.clone();

        // --- Stage 1: Parallel Preprocessing & Stream Transfer ---
        let preprocess_handle = tokio::task::spawn_blocking(move || {
            use rayon::prelude::*;
            png_files.into_par_iter().for_each(|path| {
                if state_clone.is_cancelled.load(Ordering::Relaxed) {
                    return;
                }
                match self_clone.preprocess_image(&path) {
                    Ok(tensor) => {
                        let _ = tensor_tx.blocking_send((path, tensor));
                    }
                    Err(e) => {
                        println!("❌ Preprocessing failed for {:?}: {}", path, e);
                        progress_events::decrease_denominator(&app_handle, 1);
                    }
                }
            });
            Result::Ok(())
        });

        // --- Stage 2: Parallel Save Management ---
        let app_h2 = app.clone();
        let state_c2 = state.clone();
        let save_handle = tokio::task::spawn_blocking(move || {
            // We use a simple loop but inside we could use rayon if needed.
            // For now, let's keep it sequential per-file to avoid too much overhead, 
            // but since it's in its own task it won't block inference.
            while let Some((path, features)) = save_rx.blocking_recv() {
                if state_c2.is_cancelled.load(Ordering::Relaxed) { break; }
                let mut bin_path = path;
                bin_path.set_file_name("vector.bin");
                if let Err(e) = std::fs::write(&bin_path, bytemuck::cast_slice(&features)) {
                    println!("❌ Save failed for {:?}: {}", bin_path, e);
                } else {
                    progress_events::increase_numerator(&app_h2, 1);
                }
            }
            Result::Ok(())
        });

        // --- Stage 3: Batch Inference (Main loop) ---
        const BATCH_SIZE: usize = 32;
        let mut current_batch_paths = Vec::with_capacity(BATCH_SIZE);
        let mut current_batch_tensors = Vec::with_capacity(BATCH_SIZE);

        loop {
            if state.is_cancelled.load(Ordering::Relaxed) {
                break;
            }

            // Collect a batch or wait for one
            let mut batch_complete = false;
            while current_batch_paths.len() < BATCH_SIZE {
                match tokio::time::timeout(std::time::Duration::from_millis(50), tensor_rx.recv()).await {
                    Ok(Some((path, tensor))) => {
                        current_batch_paths.push(path);
                        current_batch_tensors.push(tensor);
                    }
                    Ok(None) => {
                        batch_complete = true;
                        break;
                    }
                    Err(_) => { // Timeout
                        if !current_batch_paths.is_empty() {
                            batch_complete = true;
                            break;
                        }
                    }
                }
            }

            if current_batch_paths.is_empty() && batch_complete {
                break;
            }

            if !current_batch_paths.is_empty() {
                let batch_len = current_batch_paths.len();
                let mut batch_input = Array4::<f32>::zeros((batch_len, 3, 224, 224));
                for (i, tensor) in current_batch_tensors.iter().enumerate() {
                    batch_input.slice_mut(ndarray::s![i, .., .., ..]).assign(&tensor.slice(ndarray::s![0, .., .., ..]));
                }

                let input_tensor = ort::value::Value::from_array(([batch_len, 3, 224, 224], batch_input.into_raw_vec_and_offset().0))
                    .map_err(|e| crate::error::AppError::Processing(e.to_string()))?;

                let res_vecs: Vec<Vec<f32>> = {
                    let mut guard = self.session.lock().map_err(|e| crate::error::AppError::Processing(format!("Lock failed: {}", e)))?;
                    let outputs = guard.run(inputs![input_tensor]).map_err(|e| crate::error::AppError::Processing(e.to_string()))?;
                    let output_val = outputs.values().next()
                        .ok_or_else(|| crate::error::AppError::Processing("No output".into()))?;
                    let extract = output_val.try_extract_tensor::<f32>()
                        .map_err(|e| crate::error::AppError::Processing(e.to_string()))?;
                    
                    let (shape, slice) = extract;
                    let feat_dim = *shape.get(1).unwrap_or(&1000) as usize;
                    let view = ndarray::ArrayView2::from_shape((batch_len, feat_dim), slice)
                        .map_err(|e| crate::error::AppError::Processing(e.to_string()))?;
                    
                    (0..batch_len).map(|i| view.slice(ndarray::s![i, ..]).to_vec()).collect()
                };

                for (path, features) in current_batch_paths.drain(..).zip(res_vecs) {
                    let _ = save_tx.send((path, features)).await;
                }
                current_batch_tensors.clear();
            }

            if batch_complete {
                break;
            }
        }

        // Wait for workers to finish
        drop(save_tx); // Close save channel so save_handle finishes
        let _ = preprocess_handle.await;
        let _ = save_handle.await;

        if state.is_cancelled.load(Ordering::Relaxed) {
            return Ok(());
        }

        state.update_status(|s| s.process_status = crate::config::ProcessStatus::Vectorized)?;
        Ok(())
    }

    fn preprocess_image(&self, path: &PathBuf) -> Result<Array4<f32>> {
        let img = image::open(path).map_err(|e| crate::error::AppError::Image(e.to_string()))?.to_rgb8();
        let resized = image::imageops::resize(&img, 224, 224, image::imageops::FilterType::Triangle);
        
        let mut input = Array4::<f32>::zeros((1, 3, 224, 224));
        for (x, y, pixel) in resized.enumerate_pixels() {
            let r = (pixel[0] as f32 / 255.0 - 0.485) / 0.229;
            let g = (pixel[1] as f32 / 255.0 - 0.456) / 0.224;
            let b = (pixel[2] as f32 / 255.0 - 0.406) / 0.225;
            input[[0, 0, y as usize, x as usize]] = r;
            input[[0, 1, y as usize, x as usize]] = g;
            input[[0, 2, y as usize, x as usize]] = b;
        }
        Ok(input)
    }
}
