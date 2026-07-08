//! Feature extraction stage: turns each rendered sample image into an
//! embedding vector with an ONNX vision model.
//!
//! A single [`Analyzer`] owns one ONNX [`Session`] guarded by a
//! mutex. Images are preprocessed in parallel with [`rayon`], run through the
//! model in fixed-size batches, and the resulting embedding for each image is
//! written next to it as `vector.bin`. On Apple silicon the CoreML execution
//! provider is used; elsewhere the default CPU provider is used.

use crate::commands::progress::progress_events;
use crate::config::ProgressStage;
use crate::core::{AppState, EventSink};
use crate::error::{AppError, Result};
use bytemuck;
use image::imageops::{replace, FilterType};
use ndarray::{s, Array4};
#[cfg(all(target_vendor = "apple", target_arch = "aarch64"))]
use ort::ep;
use ort::{
    inputs,
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

const MODEL_REPO_DIR: &str = "student_repvit_m1_0_v4";
const MODEL_FILE_NAME: &str = "model.onnx";
const DEFAULT_INPUT_SIZE: u32 = 224;
const MODEL_BATCH_DIMENSION_NAME: &str = "batch_size";
const MODEL_BATCH_SIZE: usize = 8;
const PREFERRED_EMBEDDING_OUTPUT_NAME: &str = "embedding";

/// Owns the loaded ONNX model and the preprocessing spec it expects.
pub struct Analyzer {
    /// The ONNX session. Behind a mutex because [`Session::run`] needs `&mut`
    /// while [`Analyzer`] is shared across the batch loop.
    session: Mutex<Session>,
    spec: ModelSpec,
}

/// A preprocessed image tensor together with the path it was loaded from, so
/// the resulting embedding can be written back beside it.
struct PreparedImage {
    path: PathBuf,
    input: Array4<f32>,
}

/// Outcome of preprocessing one batch: the images that decoded successfully
/// plus how many were dropped, so progress totals can be adjusted.
struct BatchResult {
    prepared_images: Vec<PreparedImage>,
    failed_count: usize,
}

impl Analyzer {
    /// Locates and loads the bundled ONNX model, returning a ready analyzer.
    pub fn new() -> Result<Self> {
        let model_dir = resolve_model_dir()?;
        let model_path = model_dir.join(MODEL_FILE_NAME);

        Ok(Self {
            session: Mutex::new(load_session(&model_path)?),
            spec: ModelSpec {
                input_size: DEFAULT_INPUT_SIZE,
            },
        })
    }

    /// Embeds every sample image in the active session.
    ///
    /// Processes images in batches of [`MODEL_BATCH_SIZE`], reporting progress
    /// through `events`/`state` and writing each embedding to `vector.bin`.
    /// Images that fail to decode or infer are dropped from the denominator
    /// rather than failing the whole run. Returns early (leaving status
    /// unchanged) if the job is cancelled mid-way.
    pub async fn analyze_all(&self, events: &impl EventSink, state: &AppState) -> Result<()> {
        let session_dir = state.get_session_dir()?;
        let png_files = collect_sample_paths(session_dir).await?;

        println!("🔍 Analyzer: Found {} images to process", png_files.len());
        if png_files.is_empty() {
            println!("⚠️ Analyzer: No images found");
            return Ok(());
        }

        progress_events::reset_progress(events, state, ProgressStage::Analysis);
        progress_events::set_progress_denominator(
            events,
            state,
            ProgressStage::Analysis,
            png_files.len() as i32,
        );

        println!(
            "🚀 Analyzer: running ONNX inference with batch size {}",
            MODEL_BATCH_SIZE
        );

        for chunk in png_files.chunks(MODEL_BATCH_SIZE) {
            if state.is_cancelled.load(Ordering::Relaxed) {
                return Ok(());
            }

            let batch = prepare_batch(chunk, &self.spec);
            progress_events::decrease_denominator(
                events,
                state,
                ProgressStage::Analysis,
                batch.failed_count as i32,
            );
            if state.is_cancelled.load(Ordering::Relaxed) {
                return Ok(());
            }

            if batch.prepared_images.is_empty() {
                continue;
            }

            let prepared_count = batch.prepared_images.len();
            match self.process_prepared_images(batch.prepared_images) {
                Ok(processed_count) => progress_events::increase_numerator(
                    events,
                    state,
                    ProgressStage::Analysis,
                    processed_count as i32,
                ),
                Err(e) => {
                    println!("❌ Analysis failed for batch: {}", e);
                    progress_events::decrease_denominator(
                        events,
                        state,
                        ProgressStage::Analysis,
                        prepared_count as i32,
                    );
                }
            }
        }

        if state.is_cancelled.load(Ordering::Relaxed) {
            return Ok(());
        }

        state.update_status(|s| s.process_status = crate::config::ProcessStatus::Analyzed)?;
        Ok(())
    }

    /// Runs inference for one prepared batch and persists every embedding,
    /// returning how many images were written.
    fn process_prepared_images(&self, prepared_images: Vec<PreparedImage>) -> Result<usize> {
        let prepared_count = prepared_images.len();
        let features = self.run_batch_inference(&prepared_images)?;
        write_feature_vectors(prepared_images, features)?;
        Ok(prepared_count)
    }

    /// Packs the batch into a single tensor, runs the model, and returns the
    /// embedding vector for each input.
    fn run_batch_inference(&self, prepared_images: &[PreparedImage]) -> Result<Vec<Vec<f32>>> {
        let tensor = tensor_from_inputs(prepared_images)?;
        let mut session = self
            .session
            .lock()
            .expect("ONNX session mutex should not be poisoned");
        let outputs = session
            .run(inputs![tensor])
            .map_err(|err| AppError::Processing(err.to_string()))?;

        extract_embeddings(&outputs, prepared_images.len())
    }
}

/// Builds and commits an ONNX session for the model at `model_path`.
fn load_session(model_path: &Path) -> Result<Session> {
    println!(
        "🚀 Analyzer: loading ONNX model from {}",
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
    let cache_dir = AppState::get_model_cache_dir()?.join(MODEL_REPO_DIR);
    builder = configure_execution_providers(builder, &cache_dir)?;

    let session = builder
        .commit_from_file(model_path)
        .map_err(|err| AppError::Processing(err.to_string()))?;

    for input in session.inputs() {
        println!("📥 Analyzer input: {:?}", input);
    }
    for output in session.outputs() {
        println!("📤 Analyzer output: {:?}", output);
    }

    Ok(session)
}

/// Registers the platform's preferred execution provider.
///
/// On Apple silicon this enables CoreML on the Neural Engine and points it at a
/// persistent on-disk cache (`cache_dir`), so the expensive compile of a large
/// model runs only on the first job rather than on every run. On every other
/// target the builder is returned unchanged so the default CPU provider runs.
fn configure_execution_providers(
    builder: SessionBuilder,
    cache_dir: &Path,
) -> Result<SessionBuilder> {
    #[cfg(all(target_vendor = "apple", target_arch = "aarch64"))]
    {
        fs::create_dir_all(cache_dir).map_err(|e| {
            AppError::Io(format!(
                "Failed to create CoreML cache dir {}: {}",
                cache_dir.display(),
                e
            ))
        })?;
        let coreml = ep::CoreML::default()
            .with_compute_units(ep::coreml::ComputeUnits::CPUAndNeuralEngine)
            .with_model_format(ep::coreml::ModelFormat::MLProgram)
            .with_static_input_shapes(true)
            .with_specialization_strategy(ep::coreml::SpecializationStrategy::FastPrediction)
            .with_model_cache_dir(cache_dir.to_string_lossy());
        let available = ep::ExecutionProvider::is_available(&coreml)
            .map_err(|err| AppError::Processing(err.to_string()))?;
        println!(
            "🚀 Analyzer: CoreML EP available={available}, cache={}",
            cache_dir.display()
        );

        builder
            .with_execution_providers([coreml.build().error_on_failure()])
            .map_err(|err| AppError::Processing(err.to_string()))
    }

    #[cfg(not(all(target_vendor = "apple", target_arch = "aarch64")))]
    {
        let _ = cache_dir;
        Ok(builder)
    }
}

/// Collects the `sample.png` path of every font under the session's
/// `samples/` directory, off the async runtime.
async fn collect_sample_paths(session_dir: PathBuf) -> Result<Vec<PathBuf>> {
    let session_dir_display = session_dir.display().to_string();
    tokio::task::spawn_blocking(move || {
        let mut png_files = Vec::new();
        let samples_dir = session_dir.join("samples");
        if let Ok(entries) = std::fs::read_dir(samples_dir) {
            for entry in entries.filter_map(|entry| entry.ok()) {
                let path = entry.path();
                if !path.is_dir() {
                    continue;
                }
                let png = path.join("sample.png");
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

/// Preprocesses a chunk of images in parallel, logging and counting any that
/// fail rather than aborting the batch.
fn prepare_batch(paths: &[PathBuf], spec: &ModelSpec) -> BatchResult {
    let mut prepared_images = Vec::new();
    let mut failed_count = 0;

    for result in preprocess_images(paths, spec) {
        match result {
            Ok(prepared) => prepared_images.push(prepared),
            Err((path, e)) => {
                failed_count += 1;
                println!("❌ Analysis failed for {:?}: {}", path, e);
            }
        }
    }

    BatchResult {
        prepared_images,
        failed_count,
    }
}

/// Stacks per-image `[1, C, H, W]` tensors into one `[MODEL_BATCH_SIZE, …]`
/// tensor.
///
/// All inputs must share the leading image's shape. The batch dimension is
/// always [`MODEL_BATCH_SIZE`] (matching the dimension override applied when
/// the session was built); a short final batch leaves the unused rows zeroed.
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

/// Writes each embedding beside the image it came from, after checking the
/// counts line up.
fn write_feature_vectors(
    prepared_images: Vec<PreparedImage>,
    features: Vec<Vec<f32>>,
) -> Result<()> {
    if prepared_images.len() != features.len() {
        return Err(AppError::Processing(format!(
            "Feature count {} does not match prepared image count {}",
            features.len(),
            prepared_images.len()
        )));
    }

    for (prepared, feature) in prepared_images.into_iter().zip(features) {
        write_feature_vector(prepared.path, &feature)?;
    }

    Ok(())
}

/// Writes one embedding as raw little-endian `f32` bytes to `vector.bin`
/// alongside the source image.
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

/// Preprocesses `paths` in parallel, pairing each failure with its path.
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

/// The preprocessing the model expects: square grayscale input size.
#[derive(Debug, Clone)]
struct ModelSpec {
    input_size: u32,
}

/// Finds the directory containing the ONNX model.
///
/// Searches development paths, the bundled resources directory (via
/// `FONTCLUSTER_RESOURCE_DIR` or relative to the executable), and accepts the
/// first location holding a non-empty `model.onnx`.
///
/// `pub(crate)` because model-coupled assets (the clusterer's
/// `attribute_directions.json`) live beside the model file.
pub(crate) fn resolve_model_dir() -> Result<PathBuf> {
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

/// Loads and preprocesses one image into the model's NCHW input tensor.
///
/// The renderer writes a white coverage mask in the PNG alpha channel. This
/// converts that mask to black ink on a white background, producing the
/// `[0, 1]` grayscale input expected by the FontCLIP ONNX wrapper.
fn preprocess_image(path: &Path, spec: &ModelSpec) -> Result<Array4<f32>> {
    let dyn_img = image::open(path)
        .map_err(|e| AppError::Image(format!("Failed to open image {}: {}", path.display(), e)))?;
    let resized = dyn_img.resize(spec.input_size, spec.input_size, FilterType::CatmullRom);
    let rgba = resized.to_rgba8();
    let gray_raw = rgba_mask_to_gray_on_white(&rgba);
    let gray = image::GrayImage::from_raw(rgba.width(), rgba.height(), gray_raw)
        .expect("RGBA mask to grayscale conversion should preserve buffer size");

    let processed = center_in_square(&gray, spec.input_size);

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
        Array4::<f32>::zeros((1, 1, spec.input_size as usize, spec.input_size as usize));
    fill_nchw_input(&processed, &mut input)?;

    Ok(input)
}

/// Centres `source` on a white `target_size` square, returning it unchanged if
/// it is already that size.
fn center_in_square(source: &image::GrayImage, target_size: u32) -> image::GrayImage {
    if source.width() == target_size && source.height() == target_size {
        return source.clone();
    }

    let mut canvas = image::GrayImage::from_pixel(target_size, target_size, image::Luma([255]));
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

/// Converts the renderer's white alpha mask into grayscale black ink on white.
fn rgba_mask_to_gray_on_white(rgba: &image::RgbaImage) -> Vec<u8> {
    let mut gray = vec![255u8; rgba.width() as usize * rgba.height() as usize];
    gray.par_iter_mut()
        .zip(rgba.as_raw().par_chunks_exact(4))
        .for_each(|(dst, src)| {
            let alpha = src[3] as f32 / 255.0;
            let coverage = src[0] as f32 * alpha;
            *dst = (255.0 - coverage).round().clamp(0.0, 255.0) as u8;
        });
    gray
}

/// Fills an NCHW tensor from a grayscale image.
///
/// Pixel values are scaled to `[0, 1]`; CLIP channel replication and
/// normalisation are intentionally owned by the ONNX wrapper.
fn fill_nchw_input(processed: &image::GrayImage, input: &mut Array4<f32>) -> Result<()> {
    let plane_len = processed.width() as usize * processed.height() as usize;
    let input_slice = input
        .as_slice_mut()
        .expect("Input tensor should be contiguous");
    let pixels = processed.as_raw();

    input_slice.par_chunks_mut(plane_len).for_each(|plane| {
        for (index, pixel) in pixels.iter().enumerate() {
            plane[index] = *pixel as f32 / 255.0;
        }
    });

    Ok(())
}

/// Pulls the embedding output out of the model's results.
///
/// Looks up the `embedding` output, validates that it is a 2-D
/// `[batch, features]` tensor with at least `expected_count` rows, and returns
/// the first `expected_count` rows as owned vectors (dropping the padding rows
/// from any short final batch).
fn extract_embeddings(
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
            PREFERRED_EMBEDDING_OUTPUT_NAME, shape
        )));
    }
    if shape[0] < expected_count {
        return Err(AppError::Processing(format!(
            "Output '{}' batch size {} is smaller than expected {}",
            PREFERRED_EMBEDDING_OUTPUT_NAME, shape[0], expected_count
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
