//! Feature extraction stage: turns each rendered sample image into an
//! embedding vector with an ONNX vision model.
//!
//! Images are preprocessed in Rust with [`rayon`]. Each fixed-size tensor is
//! sent through the parent process to ONNX Runtime Web in a webview Worker.
//! This stage validates and persists the returned embeddings as `vector.bin`;
//! model installation and job state remain owned by the Rust pipeline.

use crate::commands::progress::progress_events;
use crate::config::ProgressStage;
use crate::core::inference::{
    InferenceReply, InferenceRequest, EMBEDDING_DIMENSIONS, INFERENCE_BATCH_SIZE,
};
use crate::core::{AppState, EventSink, ModelBundle};
use crate::error::{AppError, Result};
use bytemuck;
use image::imageops::{replace, FilterType};
use ndarray::{s, Array4};
use rayon::prelude::*;
use std::fs;
use std::io::BufRead;
use std::path::{Path, PathBuf};
use std::sync::atomic::Ordering;

const MODEL_FILE_NAME: &str = "model.onnx";
const DEFAULT_INPUT_SIZE: u32 = 224;
const MODEL_BATCH_SIZE: usize = INFERENCE_BATCH_SIZE;
const MODEL_OUTPUT_DIMENSIONS: usize = EMBEDDING_DIMENSIONS;

/// Owns the validated model path and the preprocessing spec it expects.
pub struct Analyzer {
    model_path: PathBuf,
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
    /// Prepares inference from an already validated model bundle.
    ///
    /// Bundle resolution, download, and checksum verification belong to the
    /// job preparation stage. Accepting [`ModelBundle`] here keeps inference
    /// focused on model execution and prevents a second full-file checksum of
    /// large ONNX assets when analysis begins.
    pub fn new(model: &ModelBundle) -> Result<Self> {
        let model_path = model.directory.join(MODEL_FILE_NAME);

        Ok(Self {
            model_path,
            spec: ModelSpec {
                input_size: DEFAULT_INPUT_SIZE,
                output_dimensions: MODEL_OUTPUT_DIMENSIONS,
            },
        })
    }

    /// Embeds every sample image in the active session.
    ///
    /// Processes images in batches of [`MODEL_BATCH_SIZE`], reporting progress
    /// through `events`/`state` and writing each embedding to `vector.bin`.
    /// Images that fail to decode are dropped from the denominator. Inference
    /// failure stops the run before clustering can consume partial results.
    /// Returns early if the job is cancelled mid-way.
    pub async fn analyze_all(&self, events: &impl EventSink, state: &AppState) -> Result<()> {
        let session_dir = state.get_session_dir()?;
        let samples_dir = session_dir.join("samples");
        let png_files = collect_sample_paths(session_dir).await?;

        println!("🔍 Analyzer: Found {} images to process", png_files.len());
        // A re-analysis may switch to another 512-dimensional embedding
        // space. Remove every previous vector first so a failed batch cannot
        // silently leave a mixture of old and new model outputs.
        for entry in fs::read_dir(samples_dir)? {
            let vector_path = entry?.path().join("vector.bin");
            if vector_path.exists() {
                fs::remove_file(&vector_path).map_err(|error| {
                    AppError::Io(format!(
                        "Failed to remove old feature vector {}: {error}",
                        vector_path.display()
                    ))
                })?;
            }
        }

        if png_files.is_empty() {
            return Err(AppError::Processing(
                "Analysis produced no embeddings because no sample images were rendered".into(),
            ));
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

        let mut pending_progress = 0;
        let mut processed_total = 0;
        for chunk in png_files.chunks(MODEL_BATCH_SIZE) {
            if state.is_cancelled.load(Ordering::Relaxed) {
                if pending_progress > 0 {
                    progress_events::increase_numerator(
                        events,
                        state,
                        ProgressStage::Analysis,
                        pending_progress as i32,
                    );
                }
                return Ok(());
            }

            let batch = prepare_batch(chunk, &self.spec);
            if batch.failed_count > 0 {
                progress_events::decrease_denominator(
                    events,
                    state,
                    ProgressStage::Analysis,
                    batch.failed_count as i32,
                );
            }
            if state.is_cancelled.load(Ordering::Relaxed) {
                if pending_progress > 0 {
                    progress_events::increase_numerator(
                        events,
                        state,
                        ProgressStage::Analysis,
                        pending_progress as i32,
                    );
                }
                return Ok(());
            }

            if batch.prepared_images.is_empty() {
                continue;
            }

            let prepared_count = batch.prepared_images.len();
            // Inference failures invalidate the run instead of leaving a partial
            // embedding set after a model load/Worker failure.
            self.process_prepared_images(batch.prepared_images, events)?;
            processed_total += prepared_count;
            pending_progress += prepared_count;
            if pending_progress >= MODEL_BATCH_SIZE * 4 {
                progress_events::increase_numerator(
                    events,
                    state,
                    ProgressStage::Analysis,
                    pending_progress as i32,
                );
                pending_progress = 0;
            }
        }

        if pending_progress > 0 {
            progress_events::increase_numerator(
                events,
                state,
                ProgressStage::Analysis,
                pending_progress as i32,
            );
        }

        if state.is_cancelled.load(Ordering::Relaxed) {
            return Ok(());
        }
        if processed_total == 0 {
            return Err(AppError::Processing(
                "Analysis produced no embeddings".into(),
            ));
        }

        state.update_status(|s| s.process_status = crate::config::ProcessStatus::Analyzed)?;
        Ok(())
    }

    /// Runs inference for one prepared batch and persists every embedding,
    /// returning how many images were written.
    fn process_prepared_images(
        &self,
        prepared_images: Vec<PreparedImage>,
        events: &impl EventSink,
    ) -> Result<usize> {
        let prepared_count = prepared_images.len();
        let features = self.run_batch_inference(&prepared_images, events)?;
        write_feature_vectors(prepared_images, features)?;
        Ok(prepared_count)
    }

    /// Packs the batch into a single tensor, runs the model, and returns the
    /// embedding vector for each input.
    fn run_batch_inference(
        &self,
        prepared_images: &[PreparedImage],
        events: &impl EventSink,
    ) -> Result<Vec<Vec<f32>>> {
        let input = tensor_from_inputs(prepared_images)?;
        events.emit_value(
            "wasm_inference",
            serde_json::to_value(InferenceRequest {
                model_path: self.model_path.clone(),
                input,
            })?,
        )?;
        let mut line = String::new();
        if std::io::stdin().lock().read_line(&mut line)? == 0 {
            return Err(AppError::Processing("Inference connection closed".into()));
        }
        match serde_json::from_str::<InferenceReply>(&line)? {
            InferenceReply::Success(data) => {
                extract_embeddings(&data, prepared_images.len(), self.spec.output_dimensions)
            }
            InferenceReply::Error(error) => Err(AppError::Processing(error)),
        }
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
fn tensor_from_inputs(prepared_images: &[PreparedImage]) -> Result<Vec<f32>> {
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

    let (input_data, input_offset) = input.into_raw_vec_and_offset();
    debug_assert_eq!(input_offset, Some(0));

    Ok(input_data)
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
    output_dimensions: usize,
}

/// Loads and preprocesses one image into the model's NCHW input tensor.
///
/// The renderer writes a white coverage mask in the PNG alpha channel. This
/// converts that mask to black ink on a white background, producing the
/// `[0, 1]` grayscale input expected by the model API.
fn preprocess_image(path: &Path, spec: &ModelSpec) -> Result<Array4<f32>> {
    let image = image::open(path)
        .map_err(|e| AppError::Image(format!("Failed to open image {}: {}", path.display(), e)))?;
    let resized = image.resize(spec.input_size, spec.input_size, FilterType::CatmullRom);
    let (width, height, gray_pixels) = match resized {
        image::DynamicImage::ImageLumaA8(la8) => {
            let pixels = la8
                .as_raw()
                .chunks_exact(2)
                .map(|pixel| 255 - ((u16::from(pixel[0]) * u16::from(pixel[1]) + 127) / 255) as u8)
                .collect();
            (la8.width(), la8.height(), pixels)
        }
        image => {
            let rgba = image.to_rgba8();
            let pixels = rgba
                .as_raw()
                .chunks_exact(4)
                .map(|pixel| 255 - ((u16::from(pixel[0]) * u16::from(pixel[3]) + 127) / 255) as u8)
                .collect();
            (rgba.width(), rgba.height(), pixels)
        }
    };
    let gray = image::GrayImage::from_raw(width, height, gray_pixels)
        .expect("Mask conversion should preserve pixel count");

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

/// Fills an NCHW tensor from a grayscale image.
///
/// Pixel values are scaled to `[0, 1]`; any further channel adaptation and
/// normalisation are intentionally owned by the ONNX graph.
fn fill_nchw_input(processed: &image::GrayImage, input: &mut Array4<f32>) -> Result<()> {
    let plane_len = processed.width() as usize * processed.height() as usize;
    let input_slice = input
        .as_slice_mut()
        .expect("Input tensor should be contiguous");
    let pixels = processed.as_raw();

    for (destination, pixel) in input_slice.iter_mut().take(plane_len).zip(pixels) {
        *destination = *pixel as f32 / 255.0;
    }

    Ok(())
}

/// Validates the complete fixed-size output before any vectors are persisted.
/// Padding rows are discarded only after the Worker response is validated.
fn extract_embeddings(
    data: &[f32],
    expected_count: usize,
    dimensions: usize,
) -> Result<Vec<Vec<f32>>> {
    if expected_count == 0
        || expected_count > MODEL_BATCH_SIZE
        || dimensions != MODEL_OUTPUT_DIMENSIONS
        || data.len() != MODEL_BATCH_SIZE * dimensions
        || data.iter().any(|value| !value.is_finite())
    {
        return Err(AppError::Processing(
            "Invalid FontCLIP embedding output".into(),
        ));
    }
    Ok(data
        .chunks_exact(dimensions)
        .take(expected_count)
        .map(<[f32]>::to_vec)
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn short_batch_discards_only_padding_rows() {
        let data: Vec<_> = (0..MODEL_BATCH_SIZE * MODEL_OUTPUT_DIMENSIONS)
            .map(|i| i as f32)
            .collect();
        let vectors = extract_embeddings(&data, 3, MODEL_OUTPUT_DIMENSIONS).unwrap();
        assert_eq!(vectors.len(), 3);
        assert_eq!(vectors[2], data[1024..1536]);
    }

    #[test]
    fn rejects_malformed_or_nonfinite_worker_output() {
        let mut data = vec![0.0; MODEL_BATCH_SIZE * MODEL_OUTPUT_DIMENSIONS];
        assert!(extract_embeddings(&data[..data.len() - 1], 1, MODEL_OUTPUT_DIMENSIONS).is_err());
        assert!(extract_embeddings(&data, MODEL_BATCH_SIZE + 1, MODEL_OUTPUT_DIMENSIONS).is_err());
        data[0] = f32::NAN;
        assert!(extract_embeddings(&data, 1, MODEL_OUTPUT_DIMENSIONS).is_err());
        data[0] = f32::INFINITY;
        assert!(extract_embeddings(&data, 1, MODEL_OUTPUT_DIMENSIONS).is_err());
    }
}
