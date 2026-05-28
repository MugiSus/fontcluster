use crate::config::{
    AlgorithmConfig, ComputedData, FontData, FontMetadata, ProcessStatus, ProcessingProgress,
    ProcessingStatus, ProgressSection, ProgressStage, SessionConfig,
};
use crate::error::Result;
use chrono::{DateTime, Utc};
use semver::Version;
use std::collections::HashMap;
use std::fs;
use std::io::{Cursor, Read, Write};
use std::path::{Path, PathBuf};
use std::process::Child;
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};
use uuid::Uuid;
use walkdir::WalkDir;
use zip::write::SimpleFileOptions;

use super::plugin_bridge::PluginConnection;

pub const SESSION_DOCUMENT_EXTENSION: &str = "fontclusterdoc";
const MIN_SUPPORTED_SESSION_VERSION: &str = "0.13.0";
const SESSION_CONFIG_ENTRY: &str = "config.json";
const SESSION_SAMPLES_ENTRY: &str = "samples.zip";

#[derive(Clone)]
pub struct RunningJob {
    pub child: Arc<Mutex<Child>>,
    pub is_cancelled: Arc<AtomicBool>,
}

#[derive(Clone)]
pub struct AppState {
    pub current_session: Arc<Mutex<Option<SessionConfig>>>,
    pub current_job_children: Arc<Mutex<HashMap<String, RunningJob>>>,
    pub is_cancelled: Arc<AtomicBool>,
    pub plugin_bridge_font: Arc<Mutex<Option<FontMetadata>>>,
    pub plugin_bridge_modified_date: Arc<Mutex<Option<DateTime<Utc>>>>,
    pub plugin_connections: Arc<Mutex<HashMap<String, PluginConnection>>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            current_session: Arc::new(Mutex::new(None)),
            current_job_children: Arc::new(Mutex::new(HashMap::new())),
            is_cancelled: Arc::new(AtomicBool::new(false)),
            plugin_bridge_font: Arc::new(Mutex::new(None)),
            plugin_bridge_modified_date: Arc::new(Mutex::new(None)),
            plugin_connections: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn get_base_dir() -> Result<PathBuf> {
        dirs::data_dir()
            .map(|d| d.join("FontCluster"))
            .ok_or_else(|| crate::error::AppError::Io("AppData not found".into()))
    }

    pub fn get_generated_dir() -> Result<PathBuf> {
        Ok(Self::get_base_dir()?.join("Generated"))
    }

    pub fn get_session_document_path(id: &str) -> Result<PathBuf> {
        Ok(Self::get_generated_dir()?.join(format!("{id}.{SESSION_DOCUMENT_EXTENSION}")))
    }

    pub fn get_session_cache_root() -> Result<PathBuf> {
        dirs::cache_dir()
            .map(|d| d.join("FontCluster").join("Session"))
            .ok_or_else(|| crate::error::AppError::Io("Cache dir not found".into()))
    }

    pub fn get_session_cache_dir(id: &str) -> Result<PathBuf> {
        Ok(Self::get_session_cache_root()?.join(id))
    }

    pub fn get_session_dir(&self) -> Result<PathBuf> {
        let guard = self
            .current_session
            .lock()
            .map_err(|_| crate::error::AppError::Processing("Lock poisoned".into()))?;
        let session = guard
            .as_ref()
            .ok_or_else(|| crate::error::AppError::Processing("No active session".into()))?;
        let path = Self::get_session_cache_dir(&session.session_id)?;
        if !path.exists() {
            std::fs::create_dir_all(&path).map_err(|e| {
                crate::error::AppError::Io(format!(
                    "Failed to create session dir {}: {}",
                    path.display(),
                    e
                ))
            })?;
        }
        Ok(path)
    }

    pub fn prepare_session_cache(id: &str) -> Result<PathBuf> {
        let cache_root = Self::get_session_cache_root()?;
        if cache_root.exists() {
            fs::remove_dir_all(&cache_root).map_err(|e| {
                crate::error::AppError::Io(format!(
                    "Failed to clear session cache {}: {}",
                    cache_root.display(),
                    e
                ))
            })?;
        }
        let session_dir = cache_root.join(id);
        fs::create_dir_all(session_dir.join("samples")).map_err(|e| {
            crate::error::AppError::Io(format!(
                "Failed to create session cache {}: {}",
                session_dir.display(),
                e
            ))
        })?;
        Self::extract_session_samples(id, &session_dir)?;
        Ok(session_dir)
    }

    pub fn prune_unsupported_sessions() -> Result<()> {
        let generated_dir = Self::get_generated_dir()?;
        if !generated_dir.exists() {
            return Ok(());
        }

        let min_version = Version::parse(MIN_SUPPORTED_SESSION_VERSION).map_err(|e| {
            crate::error::AppError::Processing(format!(
                "Invalid minimum supported session version: {}",
                e
            ))
        })?;

        for entry in fs::read_dir(&generated_dir)? {
            let path = entry?.path();
            if !is_session_document_path(&path) {
                if path.is_dir() {
                    fs::remove_dir_all(&path)?;
                } else {
                    fs::remove_file(&path)?;
                }
                continue;
            }

            let remove = match read_session_config_from_document(&path) {
                Ok(session) => {
                    let version =
                        Version::parse(session.modified_app_version.trim_start_matches('v'))
                            .or_else(|_| {
                                Version::parse(session.app_version.trim_start_matches('v'))
                            });
                    match version {
                        Ok(version) => version < min_version,
                        Err(_) => true,
                    }
                }
                Err(_) => true,
            };
            if remove {
                fs::remove_file(&path)?;
            }
        }

        Ok(())
    }

    pub fn initialize_session(
        &self,
        text: String,
        weights: Vec<i32>,
        algorithm: Option<AlgorithmConfig>,
    ) -> Result<String> {
        let id = Uuid::now_v7().to_string();
        let session = SessionConfig {
            app_version: env!("CARGO_PKG_VERSION").to_string(),
            modified_app_version: env!("CARGO_PKG_VERSION").to_string(),
            session_id: id.clone(),
            preview_text: text,
            created_at: chrono::Utc::now(),
            modified_at: chrono::Utc::now(),
            weights,
            discovered_fonts: HashMap::new(),
            algorithm,
            status: ProcessingStatus::default(),
        };

        let generated_dir = Self::get_generated_dir()?;
        fs::create_dir_all(&generated_dir).map_err(|e| {
            crate::error::AppError::Io(format!(
                "Failed to create Generated dir {}: {}",
                generated_dir.display(),
                e
            ))
        })?;
        let session_dir = Self::prepare_session_cache(&id)?;
        write_session_document_config(&session)?;

        let mut guard = self.current_session.lock().unwrap();
        *guard = Some(session);

        println!("🚀 New session initialized!");
        println!("📂 Session ID: {}", id);
        println!(
            "📍 Absolute Path: {}",
            session_dir.canonicalize().unwrap_or(session_dir).display()
        );

        Ok(id)
    }

    pub fn load_session(&self, id: &str) -> Result<()> {
        let document_path = Self::get_session_document_path(id)?;
        let session = read_session_config_from_document(&document_path)?;
        Self::prepare_session_cache(id)?;

        let mut guard = self.current_session.lock().unwrap();
        *guard = Some(session);
        Ok(())
    }

    pub fn update_status<F>(&self, f: F) -> Result<()>
    where
        F: FnOnce(&mut ProcessingStatus),
    {
        self.update_session(|session| {
            f(&mut session.status);
        })
    }

    pub fn update_session_config(
        &self,
        text: String,
        weights: Vec<i32>,
        algorithm: Option<AlgorithmConfig>,
        status: Option<ProcessStatus>,
    ) -> Result<()> {
        self.update_session(|session| {
            session.preview_text = text;
            session.weights = weights;
            if let Some(alg) = algorithm {
                session.algorithm = Some(alg);
            }
            if let Some(s) = status {
                session.status.process_status = s;
            }
        })
    }

    pub fn update_session<F>(&self, f: F) -> Result<()>
    where
        F: FnOnce(&mut SessionConfig),
    {
        let mut guard = self.current_session.lock().unwrap();
        if let Some(session) = guard.as_mut() {
            f(session);
            session.modified_at = chrono::Utc::now();
            session.modified_app_version = env!("CARGO_PKG_VERSION").to_string();
            self.save_session(session)?;
        }
        Ok(())
    }

    pub fn update_progress<F>(&self, stage: ProgressStage, f: F) -> Result<()>
    where
        F: FnOnce(&mut ProgressSection),
    {
        let mut guard = self.current_session.lock().unwrap();
        if let Some(session) = guard.as_mut() {
            f(progress_section_mut(&mut session.status.progress, stage));
            self.save_session(session)?;
        }
        Ok(())
    }

    fn save_session(&self, session: &SessionConfig) -> Result<()> {
        write_session_document_config(session)
    }

    pub fn persist_current_session_document(&self) -> Result<()> {
        let guard = self.current_session.lock().unwrap();
        let session = guard
            .as_ref()
            .ok_or_else(|| crate::error::AppError::Processing("No active session".into()))?;
        write_session_document(session)
    }
}

fn progress_section_mut(
    progress: &mut ProcessingProgress,
    stage: ProgressStage,
) -> &mut ProgressSection {
    match stage {
        ProgressStage::Rendering => &mut progress.rendering,
        ProgressStage::Vectorization => &mut progress.vectorization,
        ProgressStage::Clustering => &mut progress.clustering,
        ProgressStage::Position => &mut progress.position,
    }
}

fn is_session_document_path(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension == SESSION_DOCUMENT_EXTENSION)
}

pub fn read_session_config_from_document(path: &Path) -> Result<SessionConfig> {
    let file = fs::File::open(path).map_err(|e| {
        crate::error::AppError::Io(format!(
            "Failed to open session document {}: {}",
            path.display(),
            e
        ))
    })?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| {
        crate::error::AppError::Processing(format!(
            "Invalid session document {}: {}",
            path.display(),
            e
        ))
    })?;
    let mut config = archive.by_name(SESSION_CONFIG_ENTRY).map_err(|e| {
        crate::error::AppError::Processing(format!(
            "Session document {} does not contain {}: {}",
            path.display(),
            SESSION_CONFIG_ENTRY,
            e
        ))
    })?;
    let mut content = String::new();
    config.read_to_string(&mut content).map_err(|e| {
        crate::error::AppError::Io(format!(
            "Failed to read {} from {}: {}",
            SESSION_CONFIG_ENTRY,
            path.display(),
            e
        ))
    })?;
    Ok(serde_json::from_str(&content)?)
}

fn read_samples_zip_from_document(path: &Path) -> Result<Option<Vec<u8>>> {
    if !path.exists() {
        return Ok(None);
    }

    let file = fs::File::open(path)?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| {
        crate::error::AppError::Processing(format!(
            "Invalid session document {}: {}",
            path.display(),
            e
        ))
    })?;
    let Ok(mut samples) = archive.by_name(SESSION_SAMPLES_ENTRY) else {
        return Ok(None);
    };
    let mut bytes = Vec::new();
    samples.read_to_end(&mut bytes).map_err(|e| {
        crate::error::AppError::Io(format!(
            "Failed to read {} from {}: {}",
            SESSION_SAMPLES_ENTRY,
            path.display(),
            e
        ))
    })?;
    Ok(Some(bytes))
}

fn empty_samples_zip() -> Result<Vec<u8>> {
    let mut cursor = Cursor::new(Vec::new());
    let writer = zip::ZipWriter::new(&mut cursor);
    writer
        .finish()
        .map_err(|e| crate::error::AppError::Processing(format!("Failed to create zip: {}", e)))?;
    Ok(cursor.into_inner())
}

fn pack_samples_zip(session_dir: &Path) -> Result<Vec<u8>> {
    let samples_dir = session_dir.join("samples");
    if !samples_dir.exists() {
        return empty_samples_zip();
    }

    let mut cursor = Cursor::new(Vec::new());
    {
        let mut writer = zip::ZipWriter::new(&mut cursor);
        let options =
            SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

        for entry in WalkDir::new(&samples_dir)
            .into_iter()
            .filter_map(|entry| entry.ok())
            .filter(|entry| entry.file_type().is_file())
        {
            let path = entry.path();
            let relative_path = path.strip_prefix(&samples_dir).map_err(|e| {
                crate::error::AppError::Processing(format!(
                    "Failed to build samples zip path {}: {}",
                    path.display(),
                    e
                ))
            })?;
            let zip_path = Path::new("samples").join(relative_path);
            writer
                .start_file(zip_path.to_string_lossy().as_ref(), options)
                .map_err(|e| {
                    crate::error::AppError::Processing(format!(
                        "Failed to start samples zip entry {}: {}",
                        zip_path.display(),
                        e
                    ))
                })?;
            let mut file = fs::File::open(path)?;
            std::io::copy(&mut file, &mut writer)?;
        }
        writer.finish().map_err(|e| {
            crate::error::AppError::Processing(format!("Failed to finish samples zip: {}", e))
        })?;
    }
    Ok(cursor.into_inner())
}

fn write_session_document_config(session: &SessionConfig) -> Result<()> {
    let document_path = AppState::get_session_document_path(&session.session_id)?;
    let samples_zip =
        read_samples_zip_from_document(&document_path)?.unwrap_or(empty_samples_zip()?);
    write_session_document_with_samples(session, &samples_zip)
}

fn write_session_document(session: &SessionConfig) -> Result<()> {
    let session_dir = AppState::get_session_cache_dir(&session.session_id)?;
    let samples_zip = pack_samples_zip(&session_dir)?;
    write_session_document_with_samples(session, &samples_zip)
}

fn write_session_document_with_samples(session: &SessionConfig, samples_zip: &[u8]) -> Result<()> {
    let generated_dir = AppState::get_generated_dir()?;
    fs::create_dir_all(&generated_dir)?;
    let document_path = AppState::get_session_document_path(&session.session_id)?;
    let temporary_document = tempfile::NamedTempFile::new_in(&generated_dir).map_err(|e| {
        crate::error::AppError::Io(format!(
            "Failed to create temporary session document in {}: {}",
            generated_dir.display(),
            e
        ))
    })?;

    {
        let mut writer = zip::ZipWriter::new(fs::File::create(temporary_document.path())?);
        let options =
            SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
        writer
            .start_file(SESSION_CONFIG_ENTRY, options)
            .map_err(|e| {
                crate::error::AppError::Processing(format!("Failed to write config entry: {}", e))
            })?;
        writer.write_all(serde_json::to_string_pretty(session)?.as_bytes())?;
        writer
            .start_file(SESSION_SAMPLES_ENTRY, options)
            .map_err(|e| {
                crate::error::AppError::Processing(format!("Failed to write samples entry: {}", e))
            })?;
        writer.write_all(samples_zip)?;
        writer.finish().map_err(|e| {
            crate::error::AppError::Processing(format!(
                "Failed to finish session document {}: {}",
                document_path.display(),
                e
            ))
        })?;
    }

    temporary_document.persist(&document_path).map_err(|e| {
        crate::error::AppError::Io(format!(
            "Failed to persist session document {}: {}",
            document_path.display(),
            e
        ))
    })?;
    Ok(())
}

impl AppState {
    fn extract_session_samples(id: &str, session_dir: &Path) -> Result<()> {
        let document_path = Self::get_session_document_path(id)?;
        if !document_path.exists() {
            return Ok(());
        }

        let Some(samples_zip) = read_samples_zip_from_document(&document_path)? else {
            return Ok(());
        };
        let reader = Cursor::new(samples_zip);
        let mut archive = zip::ZipArchive::new(reader).map_err(|e| {
            crate::error::AppError::Processing(format!(
                "Invalid {} in {}: {}",
                SESSION_SAMPLES_ENTRY,
                document_path.display(),
                e
            ))
        })?;

        for i in 0..archive.len() {
            let mut file = archive.by_index(i).map_err(|e| {
                crate::error::AppError::Processing(format!(
                    "Failed to read samples zip index {}: {}",
                    i, e
                ))
            })?;
            let Some(enclosed_path) = file.enclosed_name().map(|path| path.to_owned()) else {
                continue;
            };
            let output_path = session_dir.join(enclosed_path);
            if file.name().ends_with('/') {
                fs::create_dir_all(&output_path)?;
                continue;
            }
            if let Some(parent) = output_path.parent() {
                fs::create_dir_all(parent)?;
            }
            let mut output = fs::File::create(&output_path)?;
            std::io::copy(&mut file, &mut output)?;
        }

        Ok(())
    }
}

pub fn save_font_metadata(session_dir: &Path, meta: &FontMetadata) -> Result<()> {
    let font_dir = session_dir.join("samples").join(&meta.safe_name);
    fs::create_dir_all(&font_dir).map_err(|e| {
        crate::error::AppError::Io(format!(
            "Failed to create font dir {}: {}",
            font_dir.display(),
            e
        ))
    })?;
    let meta_path = font_dir.join("meta.json");
    fs::write(&meta_path, serde_json::to_string_pretty(meta)?).map_err(|e| {
        crate::error::AppError::Io(format!(
            "Failed to save font metadata {}: {}",
            meta_path.display(),
            e
        ))
    })?;
    Ok(())
}

pub fn load_font_metadata(session_dir: &Path, safe_name: &str) -> Result<FontMetadata> {
    let path = session_dir
        .join("samples")
        .join(safe_name)
        .join("meta.json");
    Ok(serde_json::from_str(&fs::read_to_string(&path).map_err(
        |e| {
            crate::error::AppError::Io(format!(
                "Failed to load font metadata {}: {}",
                path.display(),
                e
            ))
        },
    )?)?)
}

pub fn save_computed_data(
    session_dir: &Path,
    safe_name: &str,
    computed: &ComputedData,
) -> Result<()> {
    let font_dir = session_dir.join("samples").join(safe_name);
    fs::create_dir_all(&font_dir).map_err(|e| {
        crate::error::AppError::Io(format!(
            "Failed to create font dir {}: {}",
            font_dir.display(),
            e
        ))
    })?;
    let computed_path = font_dir.join("computed.json");
    fs::write(&computed_path, serde_json::to_string_pretty(computed)?).map_err(|e| {
        crate::error::AppError::Io(format!(
            "Failed to save computed data {}: {}",
            computed_path.display(),
            e
        ))
    })?;
    Ok(())
}

pub fn load_computed_data(session_dir: &Path, safe_name: &str) -> Result<ComputedData> {
    let path = session_dir
        .join("samples")
        .join(safe_name)
        .join("computed.json");
    Ok(serde_json::from_str(&fs::read_to_string(&path).map_err(
        |e| {
            crate::error::AppError::Io(format!(
                "Failed to load computed data {}: {}",
                path.display(),
                e
            ))
        },
    )?)?)
}

pub fn load_font_data(session_dir: &Path, safe_name: &str) -> Result<FontData> {
    let meta = load_font_metadata(session_dir, safe_name)?;
    let computed = load_computed_data(session_dir, safe_name).ok();
    Ok(FontData { meta, computed })
}
