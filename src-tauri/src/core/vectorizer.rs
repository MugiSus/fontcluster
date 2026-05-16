use crate::commands::progress::progress_events;
use crate::config::ProgressStage;
use crate::core::{AppState, EventSink};
use crate::error::{AppError, Result};
use bytemuck;
use image::imageops::{replace, FilterType};
use ndarray::{s, Array4};
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
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Mutex,
};

const MODEL_REPO_DIR: &str = "repvit_m1.dist_in1k";
const MODEL_FILE_NAME: &str = "model.onnx";
const DEFAULT_INPUT_SIZE: u32 = 224;
const MODEL_BATCH_DIMENSION_NAME: &str = "batch_size";
const MODEL_BATCH_SIZE: usize = 8;
const PREFERRED_EMBEDDING_OUTPUT_NAME: &str = "embedding";
const DEFAULT_MEAN: [f32; 3] = [0.485, 0.456, 0.406];
const DEFAULT_STD: [f32; 3] = [0.229, 0.224, 0.225];

pub struct Vectorizer {
    session: Mutex<Session>,
    spec: ModelSpec,
    provider_profile_logged: AtomicBool,
}

struct PreparedImage {
    path: PathBuf,
    input: Array4<f32>,
}

impl Vectorizer {
    pub fn new() -> Result<Self> {
        let model_dir = resolve_model_dir()?;
        let model_path = model_dir.join(MODEL_FILE_NAME);
        let spec = default_model_spec();

        let session = load_session(&model_path)?;

        Ok(Self {
            session: Mutex::new(session),
            spec,
            provider_profile_logged: AtomicBool::new(false),
        })
    }

    pub async fn vectorize_all(&self, events: &impl EventSink, state: &AppState) -> Result<()> {
        let session_dir = state.get_session_dir()?;
        let png_files = collect_sample_paths(session_dir).await?;

        println!("🔍 Vectorizer: Found {} images to process", png_files.len());
        if png_files.is_empty() {
            println!("⚠️ Vectorizer: No images found");
            return Ok(());
        }

        progress_events::reset_progress(events, state, ProgressStage::Vectorization);
        progress_events::set_progress_denominator(
            events,
            state,
            ProgressStage::Vectorization,
            png_files.len() as i32,
        );

        println!(
            "🚀 Vectorizer: running ONNX inference with batch size {}",
            MODEL_BATCH_SIZE
        );

        for chunk in png_files.chunks(MODEL_BATCH_SIZE) {
            if state.is_cancelled.load(Ordering::Relaxed) {
                return Ok(());
            }

            let mut prepared_images = Vec::new();
            for result in preprocess_images(chunk, &self.spec) {
                if state.is_cancelled.load(Ordering::Relaxed) {
                    return Ok(());
                }

                match result {
                    Ok(prepared) => prepared_images.push(prepared),
                    Err((path, e)) => {
                        println!("❌ Vectorization failed for {:?}: {}", path, e);
                        progress_events::decrease_denominator(
                            events,
                            state,
                            ProgressStage::Vectorization,
                            1,
                        );
                    }
                }
            }

            if prepared_images.is_empty() {
                continue;
            }

            let prepared_count = prepared_images.len();
            match self.process_prepared_images(prepared_images) {
                Ok(processed_count) => progress_events::increase_numerator(
                    events,
                    state,
                    ProgressStage::Vectorization,
                    processed_count as i32,
                ),
                Err(e) => {
                    println!("❌ Vectorization failed for batch: {}", e);
                    progress_events::decrease_denominator(
                        events,
                        state,
                        ProgressStage::Vectorization,
                        prepared_count as i32,
                    );
                }
            }
        }

        if state.is_cancelled.load(Ordering::Relaxed) {
            return Ok(());
        }

        state.update_status(|s| s.process_status = crate::config::ProcessStatus::Vectorized)?;
        Ok(())
    }

    fn process_prepared_images(&self, prepared_images: Vec<PreparedImage>) -> Result<usize> {
        let prepared_count = prepared_images.len();
        let tensor = tensor_from_inputs(&prepared_images)?;

        let features = {
            let mut session = self
                .session
                .lock()
                .expect("ONNX session mutex should not be poisoned");
            let outputs = session
                .run(inputs![tensor])
                .map_err(|err| AppError::Processing(err.to_string()))?;

            let features = select_embeddings_from_outputs(&outputs, prepared_count)?;
            drop(outputs);
            self.log_provider_profile_once(&mut session);
            features
        };

        for (prepared, feature) in prepared_images.into_iter().zip(features) {
            write_feature_vector(prepared.path, &feature)?;
        }

        Ok(prepared_count)
    }

    fn log_provider_profile_once(&self, session: &mut Session) {
        if self.provider_profile_logged.swap(true, Ordering::Relaxed) {
            return;
        }

        #[cfg(all(target_vendor = "apple", target_arch = "aarch64"))]
        {
            if let Err(err) = log_provider_profile(session) {
                println!(
                    "⚠️ Vectorizer: failed to inspect ONNX Runtime provider profile: {}",
                    err
                );
            }
        }
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
    builder = builder
        .with_dimension_override(MODEL_BATCH_DIMENSION_NAME, MODEL_BATCH_SIZE as i64)
        .map_err(|err| AppError::Processing(err.to_string()))?;
    builder = configure_execution_providers(builder)?;
    builder = configure_provider_profiling(builder)?;

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
    #[cfg(all(target_vendor = "apple", target_arch = "aarch64"))]
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

    #[cfg(not(all(target_vendor = "apple", target_arch = "aarch64")))]
    {
        Ok(builder)
    }
}

fn configure_provider_profiling(builder: SessionBuilder) -> Result<SessionBuilder> {
    #[cfg(all(target_vendor = "apple", target_arch = "aarch64"))]
    {
        let path =
            std::env::temp_dir().join(format!("fontcluster-ort-profile-{}", std::process::id()));
        builder
            .with_profiling(path)
            .map_err(|err| AppError::Processing(err.to_string()))
    }

    #[cfg(not(all(target_vendor = "apple", target_arch = "aarch64")))]
    {
        Ok(builder)
    }
}

#[cfg(all(target_vendor = "apple", target_arch = "aarch64"))]
fn log_provider_profile(session: &mut Session) -> Result<()> {
    let profile_path = session
        .end_profiling()
        .map_err(|err| AppError::Processing(err.to_string()))?;
    let profile_json = fs::read_to_string(&profile_path).map_err(|err| {
        AppError::Io(format!(
            "Failed to read ONNX Runtime profile {}: {}",
            profile_path, err
        ))
    })?;
    let profile: serde_json::Value = serde_json::from_str(&profile_json).map_err(|err| {
        AppError::Processing(format!("Failed to parse ONNX Runtime profile: {err}"))
    })?;

    let Some(events) = profile.as_array() else {
        println!(
            "Vectorizer: ONNX Runtime profile did not contain event records: {}",
            profile_path
        );
        return Ok(());
    };

    let mut provider_counts = std::collections::BTreeMap::<String, usize>::new();
    let mut provider_durations_us = std::collections::BTreeMap::<String, u64>::new();
    for event in events {
        let Some(provider) = event
            .get("args")
            .and_then(|args| args.get("provider"))
            .and_then(|provider| provider.as_str())
        else {
            continue;
        };
        let provider = provider.to_string();
        *provider_counts.entry(provider.clone()).or_default() += 1;
        *provider_durations_us.entry(provider).or_default() += event
            .get("dur")
            .and_then(|duration| duration.as_u64())
            .unwrap_or(0);
    }

    if provider_counts.is_empty() {
        println!(
            "Vectorizer: ONNX Runtime profile contained no provider assignments: {}",
            profile_path
        );
        return Ok(());
    }

    let summary = provider_counts
        .iter()
        .map(|(provider, count)| {
            let duration_ms =
                provider_durations_us.get(provider).copied().unwrap_or(0) as f64 / 1000.0;
            format!("{provider}={count} ({duration_ms:.3}ms)")
        })
        .collect::<Vec<_>>()
        .join(", ");
    println!(
        "Vectorizer: ONNX Runtime provider profile: {summary}; profile={}",
        profile_path
    );

    if provider_counts.contains_key("CoreMLExecutionProvider") {
        println!("Vectorizer: confirmed inference executed through CoreMLExecutionProvider");
    } else {
        println!(
            "Vectorizer: CoreMLExecutionProvider was registered, but this profiled inference did not run on CoreML"
        );
    }

    Ok(())
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

fn tensor_from_inputs(prepared_images: &[PreparedImage]) -> Result<Tensor<f32>> {
    let first_input = prepared_images
        .first()
        .ok_or_else(|| AppError::Processing("Cannot run inference with an empty batch".into()))?;
    let shape = first_input.input.shape();
    if shape.len() != 4 || shape[0] != 1 {
        return Err(AppError::Processing(format!(
            "Prepared image input must be [1, channels, height, width], got {:?}",
            shape
        )));
    }

    let mut input = Array4::<f32>::zeros((MODEL_BATCH_SIZE, shape[1], shape[2], shape[3]));
    for (batch_index, prepared) in prepared_images.iter().enumerate() {
        if prepared.input.shape() != shape {
            return Err(AppError::Processing(format!(
                "Prepared image input shape mismatch: expected {:?}, got {:?}",
                shape,
                prepared.input.shape()
            )));
        }
        input
            .slice_mut(s![batch_index, .., .., ..])
            .assign(&prepared.input.slice(s![0, .., .., ..]));
    }

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

fn resolve_model_dir() -> Result<PathBuf> {
    let mut roots = vec![PathBuf::from("src-tauri/models"), PathBuf::from("models")];

    if let Ok(resource_dir) = std::env::var("FONTCLUSTER_RESOURCE_DIR") {
        roots.push(PathBuf::from(resource_dir).join("models"));
    }

    if let Ok(exe) = std::env::current_exe() {
        if let Some(exe_dir) = exe.parent() {
            roots.push(exe_dir.join("../Resources/models"));
            roots.push(exe_dir.join("models"));
        }
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

fn select_embeddings_from_outputs(
    outputs: &ort::session::SessionOutputs<'_>,
    expected_count: usize,
) -> Result<Vec<Vec<f32>>> {
    let output = outputs
        .get(PREFERRED_EMBEDDING_OUTPUT_NAME)
        .ok_or_else(|| {
            AppError::Processing(format!(
                "Model output '{}' was not found",
                PREFERRED_EMBEDDING_OUTPUT_NAME
            ))
        })?;

    extract_feature_outputs(PREFERRED_EMBEDDING_OUTPUT_NAME, output, expected_count)
}

fn extract_feature_outputs(
    name: &str,
    output: &ort::value::DynValue,
    expected_count: usize,
) -> Result<Vec<Vec<f32>>> {
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
    if shape[0] < expected_count {
        return Err(AppError::Processing(format!(
            "Output '{}' batch size {} is smaller than expected {}",
            name, shape[0], expected_count
        )));
    }

    let feature_dim = shape[1];
    Ok((0..expected_count)
        .map(|batch_index| {
            let start = batch_index * feature_dim;
            let end = start + feature_dim;
            data[start..end].to_vec()
        })
        .collect())
}
