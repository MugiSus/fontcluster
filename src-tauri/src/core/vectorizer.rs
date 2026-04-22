use crate::commands::progress::progress_events;
use crate::core::AppState;
use crate::error::{AppError, Result};
use bytemuck;
use image::imageops::{crop_imm, resize, FilterType};
use ndarray::Array4;
use ort::{
    inputs,
    session::{builder::GraphOptimizationLevel, Session},
    value::Tensor,
};
use serde::Deserialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{atomic::Ordering, Mutex};
use tauri::{AppHandle, Manager};

const MODEL_REPO_DIR: &str = "repvit_m1.dist_in1k";
const MODEL_FILE_NAME: &str = "model.onnx";
const PREPROCESS_FILE_NAME: &str = "preprocess.json";
const META_FILE_NAME: &str = "meta.json";
const DEFAULT_INPUT_SIZE: u32 = 224;
const PREFERRED_EMBEDDING_OUTPUT_NAME: &str = "embedding";

pub struct Vectorizer {
    session: Mutex<Session>,
    spec: ModelSpec,
}

impl Vectorizer {
    pub fn new(app: &AppHandle) -> Result<Self> {
        let model_dir = resolve_model_dir(app)?;
        let model_path = model_dir.join(MODEL_FILE_NAME);
        let spec = load_model_spec(&model_dir)?;

        println!("🚀 Vectorizer: loading ONNX model from {}", model_path.display());

        let mut builder =
            Session::builder().map_err(|err| AppError::Processing(err.to_string()))?;
        builder = builder
            .with_optimization_level(GraphOptimizationLevel::Level3)
            .map_err(|err| AppError::Processing(err.to_string()))?;
        builder = builder
            .with_intra_threads(1)
            .map_err(|err| AppError::Processing(err.to_string()))?;

        let session = builder
            .commit_from_file(&model_path)
            .map_err(|err| AppError::Processing(err.to_string()))?;

        for input in session.inputs() {
            println!("📥 Vectorizer input: {:?}", input);
        }
        for output in session.outputs() {
            println!("📤 Vectorizer output: {:?}", output);
        }

        Ok(Self {
            session: Mutex::new(session),
            spec,
        })
    }

    pub async fn vectorize_all(&self, app: &AppHandle, state: &AppState) -> Result<()> {
        let session_dir = state.get_session_dir()?;
        let session_dir_display = session_dir.display().to_string();
        let png_files = tokio::task::spawn_blocking(move || {
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
        .map_err(|e| AppError::Processing(e.to_string()))?;

        println!("🔍 Vectorizer: Found {} images to process", png_files.len());
        if png_files.is_empty() {
            println!("⚠️ Vectorizer: No images found in {}", session_dir_display);
            return Ok(());
        }

        progress_events::reset_progress(app);
        progress_events::set_progress_denominator(app, png_files.len() as i32);

        for path in png_files {
            if state.is_cancelled.load(Ordering::Relaxed) {
                return Ok(());
            }

            match self.process_image(path.clone()) {
                Ok(_) => progress_events::increase_numerator(app, 1),
                Err(e) => {
                    println!("❌ Vectorization failed for {:?}: {}", path, e);
                    progress_events::decrease_denominator(app, 1);
                }
            }
        }

        if state.is_cancelled.load(Ordering::Relaxed) {
            return Ok(());
        }

        state.update_status(|s| s.process_status = crate::config::ProcessStatus::Vectorized)?;
        Ok(())
    }

    fn process_image(&self, path: PathBuf) -> Result<()> {
        let input = preprocess_image(&path, &self.spec)?;
        let shape = input.shape().to_vec();
        let (input_data, input_offset) = input.into_raw_vec_and_offset();
        if input_offset != Some(0) {
            return Err(AppError::Processing(
                "Unexpected non-zero array offset in input tensor".into(),
            ));
        }

        let tensor = Tensor::from_array(([
            shape[0], shape[1], shape[2], shape[3],
        ], input_data))
        .map_err(|err| AppError::Processing(err.to_string()))?;

        let features = {
            let mut session = self
                .session
                .lock()
                .map_err(|_| AppError::Processing("Failed to lock ONNX session".into()))?;
            let outputs = session
                .run(inputs![tensor])
                .map_err(|err| AppError::Processing(err.to_string()))?;

            select_embedding_from_outputs(&outputs, &self.spec)?
        };

        let mut bin_path = path;
        bin_path.set_file_name("vector.bin");
        fs::write(&bin_path, bytemuck::cast_slice(&features)).map_err(|e| {
            AppError::Io(format!(
                "Failed to write vector bin {}: {}",
                bin_path.display(),
                e
            ))
        })?;

        Ok(())
    }
}

#[derive(Debug, Clone)]
struct ModelSpec {
    input_size: u32,
    preprocess: PreprocessConfig,
    num_features: Option<usize>,
    num_classes: Option<usize>,
}

#[derive(Debug, Clone, Deserialize)]
struct PreprocessConfig {
    stages: Vec<PreprocessStage>,
}

#[derive(Debug, Clone, Deserialize)]
struct PreprocessStage {
    #[serde(rename = "type")]
    stage_type: String,
    size: Option<serde_json::Value>,
    interpolation: Option<String>,
    mean: Option<Vec<f32>>,
    std: Option<Vec<f32>>,
}

#[derive(Debug, Clone, Deserialize)]
struct MetaConfig {
    input_size: Option<u32>,
    num_features: Option<usize>,
    num_classes: Option<usize>,
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

fn load_model_spec(model_dir: &Path) -> Result<ModelSpec> {
    let meta = load_optional_json::<MetaConfig>(&model_dir.join(META_FILE_NAME))?;
    let input_size = meta
        .as_ref()
        .and_then(|value| value.input_size)
        .unwrap_or(DEFAULT_INPUT_SIZE);

    let preprocess = match load_optional_json::<PreprocessConfig>(&model_dir.join(PREPROCESS_FILE_NAME))? {
        Some(config) => config,
        None => default_preprocess(input_size),
    };

    Ok(ModelSpec {
        input_size,
        preprocess,
        num_features: meta.as_ref().and_then(|value| value.num_features),
        num_classes: meta.as_ref().and_then(|value| value.num_classes),
    })
}

fn load_optional_json<T>(path: &Path) -> Result<Option<T>>
where
    T: for<'de> Deserialize<'de>,
{
    if !path.exists() {
        return Ok(None);
    }

    let text = fs::read_to_string(path).map_err(|e| {
        AppError::Io(format!("Failed to read config {}: {}", path.display(), e))
    })?;

    let value = serde_json::from_str(&text).map_err(|e| {
        AppError::Processing(format!("Failed to parse config {}: {}", path.display(), e))
    })?;

    Ok(Some(value))
}

fn default_preprocess(input_size: u32) -> PreprocessConfig {
    PreprocessConfig {
        stages: vec![
            PreprocessStage {
                stage_type: "resize".into(),
                size: Some(serde_json::Value::from(input_size)),
                interpolation: Some("triangle".into()),
                mean: None,
                std: None,
            },
            PreprocessStage {
                stage_type: "maybe_to_tensor".into(),
                size: None,
                interpolation: None,
                mean: None,
                std: None,
            },
        ],
    }
}

fn preprocess_image(path: &PathBuf, spec: &ModelSpec) -> Result<Array4<f32>> {
    let dyn_img = image::open(path)
        .map_err(|e| AppError::Image(format!("Failed to open image {}: {}", path.display(), e)))?;
    let rgba = dyn_img.to_rgba8();

    let mut rgb = image::RgbImage::from_pixel(rgba.width(), rgba.height(), image::Rgb([0, 0, 0]));
    for (x, y, pixel) in rgba.enumerate_pixels() {
        let alpha = pixel[3] as f32 / 255.0;
        for channel in 0..3 {
            rgb.get_pixel_mut(x, y)[channel] = (pixel[channel] as f32 * alpha).round() as u8;
        }
    }

    let mut processed = rgb;
    let mut mean: Option<Vec<f32>> = None;
    let mut std: Option<Vec<f32>> = None;

    for stage in &spec.preprocess.stages {
        match stage.stage_type.as_str() {
            "resize" => {
                let target = parse_scalar_size(stage.size.as_ref())?;
                let (new_width, new_height) =
                    resize_shortest_edge(processed.width(), processed.height(), target);
                processed = resize(
                    &processed,
                    new_width,
                    new_height,
                    parse_filter_type(stage.interpolation.as_deref()),
                );
            }
            "center_crop" => {
                let (crop_width, crop_height) = parse_pair_size(stage.size.as_ref())?;
                if crop_width > processed.width() || crop_height > processed.height() {
                    return Err(AppError::Processing(format!(
                        "Center crop size {}x{} is larger than image {}x{}",
                        crop_width,
                        crop_height,
                        processed.width(),
                        processed.height()
                    )));
                }

                let x = (processed.width() - crop_width) / 2;
                let y = (processed.height() - crop_height) / 2;
                processed = crop_imm(&processed, x, y, crop_width, crop_height).to_image();
            }
            "maybe_to_tensor" => {}
            "normalize" => {
                if let Some(stage_mean) = &stage.mean {
                    mean = Some(stage_mean.clone());
                }
                if let Some(stage_std) = &stage.std {
                    std = Some(stage_std.clone());
                }
            }
            other => {
                return Err(AppError::Processing(format!(
                    "Unsupported preprocess stage '{}'",
                    other
                )))
            }
        }
    }

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
    for (x, y, pixel) in processed.enumerate_pixels() {
        for channel in 0..3 {
            let value = pixel[channel] as f32 / 255.0;
            let normalized = match (&mean, &std) {
                (Some(mean), Some(std)) => (value - mean[channel]) / std[channel],
                _ => value,
            };
            input[[0, channel, y as usize, x as usize]] = normalized;
        }
    }

    Ok(input)
}

fn select_embedding_from_outputs(
    outputs: &ort::session::SessionOutputs<'_>,
    spec: &ModelSpec,
) -> Result<Vec<f32>> {
    for (name, output) in outputs.iter() {
        if name == PREFERRED_EMBEDDING_OUTPUT_NAME {
            return extract_feature_output(name, &output);
        }
    }

    if let Some(num_features) = spec.num_features {
        for (name, output) in outputs.iter() {
            let shape = output_shape(&output)?;
            if output_matches_feature_dim(&shape, num_features)
                && !output_matches_class_dim(&shape, spec.num_classes)
            {
                return extract_feature_output(name, &output);
            }
        }
    }

    if outputs.len() == 1 {
        let (name, output) = outputs.iter().next().unwrap();
        return extract_feature_output(name, &output);
    }

    let mut details = Vec::new();
    for (name, output) in outputs.iter() {
        details.push(format!("{} {:?}", name, output_shape(&output)?));
    }

    Err(AppError::Processing(format!(
        "Could not determine embedding output from model outputs: {}",
        details.join(", ")
    )))
}

fn extract_feature_output(name: &str, output: &ort::value::DynValue) -> Result<Vec<f32>> {
    let array = output
        .try_extract_array::<f32>()
        .map_err(|err| AppError::Processing(err.to_string()))?;
    let shape = array.shape().to_vec();
    let data = array.as_slice().ok_or_else(|| {
        AppError::Processing(format!(
            "Output tensor '{}' is not contiguous in memory",
            name
        ))
    })?;

    extract_feature_vector(name, &shape, data)
}

fn extract_feature_vector(name: &str, shape: &[usize], data: &[f32]) -> Result<Vec<f32>> {
    match shape.len() {
        2 => {
            let feature_dim = shape[1];
            Ok(data[..feature_dim].to_vec())
        }
        3 => {
            let feature_dim = shape[2];
            Ok(data[..feature_dim].to_vec())
        }
        4 => {
            let channels = shape[1];
            let spatial = shape[2] * shape[3];
            if channels == 0 || spatial == 0 {
                return Err(AppError::Processing(format!(
                    "Output '{}' has invalid 4D shape {:?}",
                    name, shape
                )));
            }

            let mut pooled = vec![0.0f32; channels];
            for c in 0..channels {
                let start = c * spatial;
                let end = start + spatial;
                pooled[c] = data[start..end].iter().sum::<f32>() / spatial as f32;
            }
            Ok(pooled)
        }
        rank => Err(AppError::Processing(format!(
            "Unsupported output rank {} for '{}'",
            rank, name
        ))),
    }
}

fn output_shape(output: &ort::value::DynValue) -> Result<Vec<usize>> {
    let array = output
        .try_extract_array::<f32>()
        .map_err(|err| AppError::Processing(err.to_string()))?;
    Ok(array.shape().to_vec())
}

fn output_matches_feature_dim(shape: &[usize], num_features: usize) -> bool {
    match shape.len() {
        2 => shape[1] == num_features,
        3 => shape[2] == num_features,
        4 => shape[1] == num_features,
        _ => false,
    }
}

fn output_matches_class_dim(shape: &[usize], num_classes: Option<usize>) -> bool {
    let Some(num_classes) = num_classes else {
        return false;
    };
    match shape.len() {
        2 => shape[1] == num_classes,
        3 => shape[2] == num_classes,
        4 => shape[1] == num_classes,
        _ => false,
    }
}

fn parse_scalar_size(size: Option<&serde_json::Value>) -> Result<u32> {
    match size {
        Some(serde_json::Value::Number(number)) => number
            .as_u64()
            .map(|value| value as u32)
            .ok_or_else(|| AppError::Processing("Resize size must be a positive integer".into())),
        Some(other) => Err(AppError::Processing(format!(
            "Resize size must be an integer, got {}",
            other
        ))),
        None => Err(AppError::Processing("Resize stage is missing size".into())),
    }
}

fn parse_pair_size(size: Option<&serde_json::Value>) -> Result<(u32, u32)> {
    let Some(serde_json::Value::Array(values)) = size else {
        return Err(AppError::Processing(
            "Center crop size must be a two-element array".into(),
        ));
    };
    if values.len() != 2 {
        return Err(AppError::Processing(
            "Center crop size must have exactly two elements".into(),
        ));
    }

    let height = values[0]
        .as_u64()
        .ok_or_else(|| AppError::Processing("Center crop height must be an integer".into()))?
        as u32;
    let width = values[1]
        .as_u64()
        .ok_or_else(|| AppError::Processing("Center crop width must be an integer".into()))?
        as u32;

    Ok((width, height))
}

fn resize_shortest_edge(width: u32, height: u32, target: u32) -> (u32, u32) {
    if width == 0 || height == 0 {
        return (target, target);
    }

    if width <= height {
        let scale = target as f32 / width as f32;
        (target, (height as f32 * scale).round() as u32)
    } else {
        let scale = target as f32 / height as f32;
        ((width as f32 * scale).round() as u32, target)
    }
}

fn parse_filter_type(interpolation: Option<&str>) -> FilterType {
    match interpolation.unwrap_or("triangle") {
        "nearest" => FilterType::Nearest,
        "triangle" => FilterType::Triangle,
        "catmullrom" | "bicubic" => FilterType::CatmullRom,
        "gaussian" => FilterType::Gaussian,
        "lanczos3" => FilterType::Lanczos3,
        _ => FilterType::Triangle,
    }
}
