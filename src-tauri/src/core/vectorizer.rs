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
use std::path::PathBuf;
use std::sync::{atomic::Ordering, Mutex};
use tauri::{AppHandle, Manager};
use tempfile::TempDir;

const MODEL_STEM: &str = "dinov3-vits16-pretrain-lvd1689m";
const CANONICAL_MODEL_NAME: &str = "model.onnx";
const CANONICAL_DATA_NAME: &str = "model.onnx_data";
const DEFAULT_INPUT_SIZE: u32 = 224;
const DEFAULT_MODEL_MEAN: [f32; 3] = [0.485, 0.456, 0.406];
const DEFAULT_MODEL_STD: [f32; 3] = [0.229, 0.224, 0.225];

pub struct Vectorizer {
    session: Mutex<Session>,
    spec: ModelSpec,
    _staged_model_dir: Option<TempDir>,
}

impl Vectorizer {
    pub fn new(app: &AppHandle) -> Result<Self> {
        let (model_path, staged_model_dir) = resolve_model_path(app)?;
        println!(
            "🚀 Vectorizer: loading ONNX model from {}",
            model_path.display()
        );

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
        let spec = load_model_spec(&model_path)?;

        Ok(Self {
            session: Mutex::new(session),
            spec,
            _staged_model_dir: staged_model_dir,
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
        let tensor = Tensor::from_array((
            [
                shape[0],
                shape[1],
                shape[2],
                shape[3],
            ],
            input_data,
        ))
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

        let mut bin_path = path.clone();
        bin_path.set_file_name("vector.bin");
        std::fs::write(&bin_path, bytemuck::cast_slice(&features)).map_err(|e| {
            crate::error::AppError::Io(format!(
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
    num_features: Option<usize>,
    num_classes: Option<usize>,
}

impl Default for PreprocessConfig {
    fn default() -> Self {
        Self {
            stages: vec![
                PreprocessStage {
                    stage_type: "resize".into(),
                    size: Some(serde_json::Value::from(DEFAULT_INPUT_SIZE)),
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
                PreprocessStage {
                    stage_type: "normalize".into(),
                    size: None,
                    interpolation: None,
                    mean: Some(DEFAULT_MODEL_MEAN.into()),
                    std: Some(DEFAULT_MODEL_STD.into()),
                },
            ],
        }
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
    let mut mean = DEFAULT_MODEL_MEAN.to_vec();
    let mut std = DEFAULT_MODEL_STD.to_vec();

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
                    mean = stage_mean.clone();
                }
                if let Some(stage_std) = &stage.std {
                    std = stage_std.clone();
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

    let mut input =
        Array4::<f32>::zeros((1, 3, processed.height() as usize, processed.width() as usize));
    for (x, y, pixel) in processed.enumerate_pixels() {
        for channel in 0..3 {
            let normalized =
                (pixel[channel] as f32 / 255.0 - mean[channel]) / std[channel];
            input[[0, channel, y as usize, x as usize]] = normalized;
        }
    }

    Ok(input)
}

fn resolve_model_path(app: &AppHandle) -> Result<(PathBuf, Option<TempDir>)> {
    let mut roots = vec![PathBuf::from("src-tauri/models"), PathBuf::from("models")];
    if let Ok(resource_dir) = app.path().resource_dir() {
        roots.push(resource_dir.join("models"));
    }

    for root in roots {
        if !root.exists() {
            continue;
        }
        if let Some(path) = find_model_file(&root)? {
            if let Some(staged) = maybe_stage_external_data_model(&path)? {
                let staged_path = staged.path().join(CANONICAL_MODEL_NAME);
                return Ok((staged_path, Some(staged)));
            }
            return Ok((path, None));
        }
    }

    Err(AppError::Processing(format!(
        "Could not find an ONNX model under src-tauri/models or bundled resources. Expected {}.onnx or model.onnx.",
        MODEL_STEM
    )))
}

fn find_model_file(root: &PathBuf) -> Result<Option<PathBuf>> {
    let mut repo_candidates = Vec::new();
    let mut direct_candidates = vec![root.join(format!("{MODEL_STEM}.onnx"))];

    for entry in jwalk::WalkDir::new(root)
        .into_iter()
        .filter_map(|entry| entry.ok())
    {
        if !entry.file_type().is_file() {
            continue;
        }
        let path = entry.path();
        let is_onnx = path.extension().and_then(|ext| ext.to_str()) == Some("onnx");
        if !is_onnx {
            continue;
        }
        let file_name = path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or_default();
        let path_str = path.to_string_lossy();
        if file_name == CANONICAL_MODEL_NAME {
            repo_candidates.push(path);
            continue;
        }
        if path_str.contains(MODEL_STEM) {
            direct_candidates.push(path);
        }
    }

    repo_candidates.sort();
    direct_candidates.sort();

    for candidate in repo_candidates.into_iter().chain(direct_candidates.into_iter()) {
        if candidate.exists() {
            let metadata = fs::metadata(&candidate).map_err(|e| {
                AppError::Io(format!(
                    "Failed to read model metadata {}: {}",
                    candidate.display(),
                    e
                ))
            })?;
            if metadata.len() > 0 {
                return Ok(Some(candidate));
            }
        }
    }

    Ok(None)
}

fn select_embedding_from_outputs(
    outputs: &ort::session::SessionOutputs<'_>,
    spec: &ModelSpec,
) -> Result<Vec<f32>> {
    for (name, output) in outputs.iter() {
        if name == "embedding" {
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

fn load_model_spec(model_path: &PathBuf) -> Result<ModelSpec> {
    let model_dir = model_path.parent().ok_or_else(|| {
        AppError::Processing(format!(
            "Model path has no parent directory: {}",
            model_path.display()
        ))
    })?;

    let preprocess_path = model_dir.join("preprocess.json");
    let preprocess = if preprocess_path.exists() {
        let text = fs::read_to_string(&preprocess_path).map_err(|e| {
            AppError::Io(format!(
                "Failed to read preprocess config {}: {}",
                preprocess_path.display(),
                e
            ))
        })?;
        serde_json::from_str(&text).map_err(|e| {
            AppError::Processing(format!(
                "Failed to parse preprocess config {}: {}",
                preprocess_path.display(),
                e
            ))
        })?
    } else {
        PreprocessConfig::default()
    };

    let meta_path = model_dir.join("meta.json");
    let meta = if meta_path.exists() {
        let text = fs::read_to_string(&meta_path).map_err(|e| {
            AppError::Io(format!("Failed to read meta config {}: {}", meta_path.display(), e))
        })?;
        Some(serde_json::from_str::<MetaConfig>(&text).map_err(|e| {
            AppError::Processing(format!("Failed to parse meta config {}: {}", meta_path.display(), e))
        })?)
    } else {
        None
    };

    Ok(ModelSpec {
        preprocess,
        num_features: meta.as_ref().and_then(|m| m.num_features),
        num_classes: meta.as_ref().and_then(|m| m.num_classes),
    })
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

fn maybe_stage_external_data_model(model_path: &PathBuf) -> Result<Option<TempDir>> {
    let model_dir = model_path.parent().ok_or_else(|| {
        AppError::Processing(format!(
            "Model path has no parent directory: {}",
            model_path.display()
        ))
    })?;
    let model_file_name = model_path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or_default();

    let canonical_data_path = model_dir.join(CANONICAL_DATA_NAME);
    if model_file_name == CANONICAL_MODEL_NAME && canonical_data_path.exists() {
        return Ok(None);
    }

    let external_data_path = find_external_data_file(model_dir)?;
    let Some(external_data_path) = external_data_path else {
        return Ok(None);
    };

    let staged_dir = tempfile::tempdir().map_err(|e| {
        AppError::Io(format!(
            "Failed to create temporary directory for staged DINOv3 model: {}",
            e
        ))
    })?;

    copy_or_hardlink(model_path, &staged_dir.path().join(CANONICAL_MODEL_NAME))?;
    copy_or_hardlink(
        &external_data_path,
        &staged_dir.path().join(CANONICAL_DATA_NAME),
    )?;

    Ok(Some(staged_dir))
}

fn find_external_data_file(model_dir: &std::path::Path) -> Result<Option<PathBuf>> {
    let canonical_data_path = model_dir.join(CANONICAL_DATA_NAME);
    if canonical_data_path.exists() {
        return Ok(Some(canonical_data_path));
    }

    let mut candidates = Vec::new();
    for entry in fs::read_dir(model_dir).map_err(|e| {
        AppError::Io(format!(
            "Failed to inspect model directory {}: {}",
            model_dir.display(),
            e
        ))
    })? {
        let entry = entry.map_err(|e| {
            AppError::Io(format!(
                "Failed to inspect model directory {}: {}",
                model_dir.display(),
                e
            ))
        })?;
        let path = entry.path();
        if path.extension().and_then(|ext| ext.to_str()) == Some("onnx_data") {
            candidates.push(path);
        }
    }

    Ok(candidates.into_iter().next())
}

fn copy_or_hardlink(src: &PathBuf, dst: &PathBuf) -> Result<()> {
    match fs::hard_link(src, dst) {
        Ok(()) => Ok(()),
        Err(_) => {
            fs::copy(src, dst).map_err(|e| {
                AppError::Io(format!(
                    "Failed to copy model asset from {} to {}: {}",
                    src.display(),
                    dst.display(),
                    e
                ))
            })?;
            Ok(())
        }
    }
}
