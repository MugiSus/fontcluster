use crate::commands::progress::progress_events;
use crate::core::AppState;
use crate::error::{AppError, Result};
use bytemuck;
use image::imageops::{replace, FilterType};
use ndarray::Array4;
use ort::{
    ep, inputs,
    session::{
        builder::{GraphOptimizationLevel, SessionBuilder},
        Session,
    },
    value::Tensor,
};
use rayon::prelude::*;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{atomic::Ordering, Mutex};
use tauri::{AppHandle, Manager};

const MODEL_REPO_DIR: &str = "repvit_m1.dist_in1k";
const MODEL_FILE_NAME: &str = "model.onnx";
const DEFAULT_INPUT_SIZE: u32 = 224;
const PREFERRED_EMBEDDING_OUTPUT_NAME: &str = "embedding";
const DEFAULT_MEAN: [f32; 3] = [0.485, 0.456, 0.406];
const DEFAULT_STD: [f32; 3] = [0.229, 0.224, 0.225];

pub struct Vectorizer {
    session: Mutex<Session>,
    spec: ModelSpec,
}

struct PreparedImage {
    path: PathBuf,
    input: Array4<f32>,
}

impl Vectorizer {
    pub fn new(app: &AppHandle) -> Result<Self> {
        let model_dir = resolve_model_dir(app)?;
        let model_path = model_dir.join(MODEL_FILE_NAME);
        let spec = default_model_spec();

        let session = load_session(&model_path)?;

        Ok(Self {
            session: Mutex::new(session),
            spec,
        })
    }

    pub async fn vectorize_all(&self, app: &AppHandle, state: &AppState) -> Result<()> {
        let session_dir = state.get_session_dir()?;
        let png_files = collect_sample_paths(session_dir).await?;

        println!("🔍 Vectorizer: Found {} images to process", png_files.len());
        if png_files.is_empty() {
            println!("⚠️ Vectorizer: No images found");
            return Ok(());
        }

        progress_events::reset_progress(app);
        progress_events::set_progress_denominator(app, png_files.len() as i32);

        let preprocess_chunk_size = rayon::current_num_threads().max(1);
        println!(
            "🚀 Vectorizer: preprocessing {} images at a time",
            preprocess_chunk_size
        );

        for chunk in png_files.chunks(preprocess_chunk_size) {
            if state.is_cancelled.load(Ordering::Relaxed) {
                return Ok(());
            }

            let prepared = preprocess_images(chunk, &self.spec);
            for result in prepared {
                if state.is_cancelled.load(Ordering::Relaxed) {
                    return Ok(());
                }

                match result {
                    Ok(prepared) => {
                        let path = prepared.path.clone();
                        match self.process_prepared_image(prepared) {
                            Ok(_) => progress_events::increase_numerator(app, 1),
                            Err(e) => {
                                println!("❌ Vectorization failed for {:?}: {}", path, e);
                                progress_events::decrease_denominator(app, 1);
                            }
                        }
                    }
                    Err((path, e)) => {
                        println!("❌ Vectorization failed for {:?}: {}", path, e);
                        progress_events::decrease_denominator(app, 1);
                    }
                }
            }
        }

        if state.is_cancelled.load(Ordering::Relaxed) {
            return Ok(());
        }

        state.update_status(|s| s.process_status = crate::config::ProcessStatus::Vectorized)?;
        Ok(())
    }

    fn process_prepared_image(&self, prepared: PreparedImage) -> Result<()> {
        let PreparedImage { path, input } = prepared;
        let tensor = tensor_from_input(input)?;

        let feature = {
            let mut session = self
                .session
                .lock()
                .expect("ONNX session mutex should not be poisoned");
            let outputs = session
                .run(inputs![tensor])
                .map_err(|err| AppError::Processing(err.to_string()))?;

            select_embedding_from_outputs(&outputs)?
        };

        write_feature_vector(path, &feature)
    }
}

fn load_session(model_path: &Path) -> Result<Session> {
    println!(
        "🚀 Vectorizer: loading ONNX model from {}",
        model_path.display()
    );

    let mut builder = Session::builder().map_err(|err| AppError::Processing(err.to_string()))?;
    builder = builder
        .with_optimization_level(GraphOptimizationLevel::Level3)
        .map_err(|err| AppError::Processing(err.to_string()))?;
    builder = builder
        .with_intra_threads(1)
        .map_err(|err| AppError::Processing(err.to_string()))?;
    builder = configure_execution_providers(builder)?;

    let session = builder
        .commit_from_file(model_path)
        .map_err(|err| AppError::Processing(err.to_string()))?;

    for input in session.inputs() {
        println!("📥 Vectorizer input: {:?}", input);
    }
    for output in session.outputs() {
        println!("📤 Vectorizer output: {:?}", output);
    }

    Ok(session)
}

fn configure_execution_providers(builder: SessionBuilder) -> Result<SessionBuilder> {
    #[cfg(target_vendor = "apple")]
    {
        let coreml = ep::CoreML::default()
            .with_compute_units(ep::coreml::ComputeUnits::CPUAndNeuralEngine)
            .with_model_format(ep::coreml::ModelFormat::MLProgram)
            .with_static_input_shapes(true)
            .with_specialization_strategy(ep::coreml::SpecializationStrategy::FastPrediction);
        let available = ep::ExecutionProvider::is_available(&coreml)
            .map_err(|err| AppError::Processing(err.to_string()))?;
        println!("🚀 Vectorizer: CoreML EP available={available}");

        builder
            .with_execution_providers([coreml.build().error_on_failure()])
            .map_err(|err| AppError::Processing(err.to_string()))
    }

    #[cfg(not(target_vendor = "apple"))]
    {
        Ok(builder)
    }
}

async fn collect_sample_paths(session_dir: PathBuf) -> Result<Vec<PathBuf>> {
    let session_dir_display = session_dir.display().to_string();
    tokio::task::spawn_blocking(move || {
        let mut png_files = Vec::new();
        for entry in jwalk::WalkDir::new(session_dir.join("samples"))
            .into_iter()
            .filter_map(|e| e.ok())
        {
            if entry.file_type().is_dir() {
                let png = entry.path().join("sample.png");
                if png.exists() {
                    png_files.push(png);
                }
            }
        }
        png_files
    })
    .await
    .map_err(|e| {
        AppError::Processing(format!(
            "Failed to collect sample images under {}: {}",
            session_dir_display, e
        ))
    })
}

fn tensor_from_input(input: Array4<f32>) -> Result<Tensor<f32>> {
    let shape = input.shape().to_vec();
    let (input_data, input_offset) = input.into_raw_vec_and_offset();
    debug_assert_eq!(input_offset, Some(0));

    Tensor::from_array(([shape[0], shape[1], shape[2], shape[3]], input_data))
        .map_err(|err| AppError::Processing(err.to_string()))
}

fn write_feature_vector(path: PathBuf, feature: &[f32]) -> Result<()> {
    let mut bin_path = path;
    bin_path.set_file_name("vector.bin");
    fs::write(&bin_path, bytemuck::cast_slice(feature)).map_err(|e| {
        AppError::Io(format!(
            "Failed to write vector bin {}: {}",
            bin_path.display(),
            e
        ))
    })?;
    Ok(())
}

fn preprocess_images(
    paths: &[PathBuf],
    spec: &ModelSpec,
) -> Vec<std::result::Result<PreparedImage, (PathBuf, AppError)>> {
    paths
        .par_iter()
        .map(|path| {
            preprocess_image(path, spec)
                .map(|input| PreparedImage {
                    path: path.clone(),
                    input,
                })
                .map_err(|err| (path.clone(), err))
        })
        .collect()
}

#[derive(Debug, Clone)]
struct ModelSpec {
    input_size: u32,
    mean: [f32; 3],
    std: [f32; 3],
}

fn resolve_model_dir(app: &AppHandle) -> Result<PathBuf> {
    let mut roots = vec![PathBuf::from("src-tauri/models"), PathBuf::from("models")];
    if let Ok(resource_dir) = app.path().resource_dir() {
        roots.push(resource_dir.join("models"));
    }

    for root in roots {
        let model_dir = root.join(MODEL_REPO_DIR);
        let model_path = model_dir.join(MODEL_FILE_NAME);
        if !model_path.exists() {
            continue;
        }

        let metadata = fs::metadata(&model_path).map_err(|e| {
            AppError::Io(format!(
                "Failed to read model metadata {}: {}",
                model_path.display(),
                e
            ))
        })?;
        if metadata.len() > 0 {
            return Ok(model_dir);
        }
    }

    Err(AppError::Processing(format!(
        "Could not find {}/{} under src-tauri/models, models, or bundled resources.",
        MODEL_REPO_DIR, MODEL_FILE_NAME
    )))
}

fn default_model_spec() -> ModelSpec {
    ModelSpec {
        input_size: DEFAULT_INPUT_SIZE,
        mean: DEFAULT_MEAN,
        std: DEFAULT_STD,
    }
}

fn preprocess_image(path: &Path, spec: &ModelSpec) -> Result<Array4<f32>> {
    let dyn_img = image::open(path)
        .map_err(|e| AppError::Image(format!("Failed to open image {}: {}", path.display(), e)))?;
    let resized = dyn_img.resize(spec.input_size, spec.input_size, FilterType::CatmullRom);
    let rgba = resized.to_rgba8();
    let rgb_raw = rgba_to_rgb_with_alpha(&rgba);
    let rgb = image::RgbImage::from_raw(rgba.width(), rgba.height(), rgb_raw)
        .expect("RGBA to RGB conversion should preserve buffer size");

    let processed = center_in_square(&rgb, spec.input_size);

    if processed.width() != spec.input_size || processed.height() != spec.input_size {
        return Err(AppError::Processing(format!(
            "Preprocess result is {}x{}, expected {}x{}",
            processed.width(),
            processed.height(),
            spec.input_size,
            spec.input_size
        )));
    }

    let mut input =
        Array4::<f32>::zeros((1, 3, spec.input_size as usize, spec.input_size as usize));
    fill_nchw_input(&processed, &mut input, Some(&spec.mean), Some(&spec.std))?;

    Ok(input)
}

fn center_in_square(source: &image::RgbImage, target_size: u32) -> image::RgbImage {
    if source.width() == target_size && source.height() == target_size {
        return source.clone();
    }

    let mut canvas = image::RgbImage::new(target_size, target_size);
    let x_offset = (target_size - source.width()) / 2;
    let y_offset = (target_size - source.height()) / 2;
    replace(
        &mut canvas,
        source,
        i64::from(x_offset),
        i64::from(y_offset),
    );
    canvas
}

fn rgba_to_rgb_with_alpha(rgba: &image::RgbaImage) -> Vec<u8> {
    let mut rgb = vec![0u8; rgba.width() as usize * rgba.height() as usize * 3];
    rgb.par_chunks_exact_mut(3)
        .zip(rgba.as_raw().par_chunks_exact(4))
        .for_each(|(dst, src)| {
            let alpha = src[3] as f32 / 255.0;
            dst[0] = (src[0] as f32 * alpha).round() as u8;
            dst[1] = (src[1] as f32 * alpha).round() as u8;
            dst[2] = (src[2] as f32 * alpha).round() as u8;
        });
    rgb
}

fn fill_nchw_input(
    processed: &image::RgbImage,
    input: &mut Array4<f32>,
    mean: Option<&[f32]>,
    std: Option<&[f32]>,
) -> Result<()> {
    let plane_len = processed.width() as usize * processed.height() as usize;
    let input_slice = input
        .as_slice_mut()
        .expect("Input tensor should be contiguous");
    let pixels = processed.as_raw();

    input_slice
        .par_chunks_mut(plane_len)
        .enumerate()
        .for_each(|(channel, plane)| {
            let mean_value = mean
                .and_then(|values| values.get(channel))
                .copied()
                .unwrap_or(0.0);
            let std_value = std
                .and_then(|values| values.get(channel))
                .copied()
                .unwrap_or(1.0);

            for (index, pixel) in pixels.chunks_exact(3).enumerate() {
                let value = pixel[channel] as f32 / 255.0;
                plane[index] = if mean.is_some() && std.is_some() {
                    (value - mean_value) / std_value
                } else {
                    value
                };
            }
        });

    Ok(())
}

fn select_embedding_from_outputs(outputs: &ort::session::SessionOutputs<'_>) -> Result<Vec<f32>> {
    let output = outputs
        .get(PREFERRED_EMBEDDING_OUTPUT_NAME)
        .ok_or_else(|| {
            AppError::Processing(format!(
                "Model output '{}' was not found",
                PREFERRED_EMBEDDING_OUTPUT_NAME
            ))
        })?;

    extract_feature_output(PREFERRED_EMBEDDING_OUTPUT_NAME, output)
}

fn extract_feature_output(name: &str, output: &ort::value::DynValue) -> Result<Vec<f32>> {
    let array = output
        .try_extract_array::<f32>()
        .map_err(|err| AppError::Processing(err.to_string()))?;
    let shape = array.shape().to_vec();
    let data = array
        .as_slice()
        .expect("ONNX output tensor should be contiguous");

    if shape.len() != 2 {
        return Err(AppError::Processing(format!(
            "Output '{}' must be 2D [batch, features], got {:?}",
            name, shape
        )));
    }

    let feature_dim = shape[1];
    Ok(data[..feature_dim].to_vec())
}
