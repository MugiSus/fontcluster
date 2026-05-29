use crate::commands::jobs::AlgorithmConfigPatch;
use crate::config::{
    AlgorithmConfig, ComputedData, FontData, FontMetadata, ProcessStatus, ProcessingProgress,
    ProcessingStatus, ProgressSection, ProgressStage, SessionConfig,
};
use crate::error::Result;
use chrono::{DateTime, Utc};
use semver::Version;
use std::collections::HashMap;
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::Child;
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex, OnceLock};
use uuid::Uuid;
use walkdir::WalkDir;
use zip::write::SimpleFileOptions;

use super::plugin_bridge::PluginConnection;

pub const SESSION_DOCUMENT_EXTENSION: &str = "fontclusterdoc";
const MIN_SUPPORTED_SESSION_VERSION: &str = "0.15.0";
const SESSION_CONFIG_FILE: &str = "config.json";

static SESSION_VIEW_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

fn session_view_lock() -> &'static Mutex<()> {
    SESSION_VIEW_LOCK.get_or_init(|| Mutex::new(()))
}

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

    pub fn get_session_processing_root() -> Result<PathBuf> {
        Ok(Self::get_session_cache_root()?.join("Processing"))
    }

    pub fn get_session_processing_dir(id: &str) -> Result<PathBuf> {
        Ok(Self::get_session_processing_root()?.join(id))
    }

    pub fn get_session_current_root() -> Result<PathBuf> {
        Ok(Self::get_session_cache_root()?.join("Current"))
    }

    pub fn get_session_current_dir(id: &str) -> Result<PathBuf> {
        Ok(Self::get_session_current_root()?.join(id))
    }

    pub fn get_session_dir(&self) -> Result<PathBuf> {
        let guard = self
            .current_session
            .lock()
            .map_err(|_| crate::error::AppError::Processing("Lock poisoned".into()))?;
        let session = guard
            .as_ref()
            .ok_or_else(|| crate::error::AppError::Processing("No active session".into()))?;
        Self::resolve_session_dir(&session.session_id)
    }

    pub fn resolve_session_dir(id: &str) -> Result<PathBuf> {
        let processing = Self::get_session_processing_dir(id)?;
        if has_session_config(&processing) {
            return Ok(processing);
        }
        let current = Self::get_session_current_dir(id)?;
        if has_session_config(&current) {
            return Ok(current);
        }
        Self::ensure_session_view(id)
    }

    pub fn ensure_session_view(id: &str) -> Result<PathBuf> {
        let _guard = session_view_lock()
            .lock()
            .map_err(|_| crate::error::AppError::Processing("Session view lock poisoned".into()))?;

        let processing = Self::get_session_processing_dir(id)?;
        if has_session_config(&processing) {
            return Ok(processing);
        }

        let document_path = Self::get_session_document_path(id)?;
        if document_path.exists() {
            if processing.exists() {
                remove_dir_all_best_effort(&processing);
            }
            let current = Self::get_session_current_dir(id)?;
            if has_session_config(&current) {
                return Ok(current);
            }
            if current.exists() {
                remove_dir_all_best_effort(&current);
            }
            fs::create_dir_all(&current).map_err(|e| {
                crate::error::AppError::Io(format!(
                    "Failed to create current session dir {}: {}",
                    current.display(),
                    e
                ))
            })?;
            extract_document_to_dir(&document_path, &current)?;
            return Ok(current);
        }

        Err(crate::error::AppError::Processing(format!(
            "Session {} not found",
            id
        )))
    }

    pub fn reconcile_session_storage() -> Result<()> {
        let processing_root = Self::get_session_processing_root()?;
        if processing_root.exists() {
            for entry in fs::read_dir(&processing_root)? {
                let path = entry?.path();
                let Some(file_name) = path.file_name().and_then(|name| name.to_str()) else {
                    continue;
                };
                if file_name.starts_with('.') {
                    remove_dir_all_best_effort(&path);
                    continue;
                }
                if !path.is_dir() {
                    continue;
                }
                if !has_session_config(&path) {
                    remove_dir_all_best_effort(&path);
                }
            }
        }

        let current_root = Self::get_session_current_root()?;
        if current_root.exists() {
            remove_dir_all_best_effort(&current_root);
        }
        Ok(())
    }

    pub fn prune_unsupported_sessions() -> Result<()> {
        let min_version = Version::parse(MIN_SUPPORTED_SESSION_VERSION).map_err(|e| {
            crate::error::AppError::Processing(format!(
                "Invalid minimum supported session version: {}",
                e
            ))
        })?;

        let generated_dir = Self::get_generated_dir()?;
        if generated_dir.exists() {
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
                    Ok(session) => parse_session_version(&session)
                        .map(|version| version < min_version)
                        .unwrap_or(true),
                    Err(_) => true,
                };
                if remove {
                    fs::remove_file(&path)?;
                }
            }
        }

        let processing_root = Self::get_session_processing_root()?;
        if processing_root.exists() {
            for entry in fs::read_dir(&processing_root)? {
                let path = entry?.path();
                if !path.is_dir() {
                    continue;
                }
                let remove = match read_session_config_from_dir(&path) {
                    Ok(session) => parse_session_version(&session)
                        .map(|version| version < min_version)
                        .unwrap_or(true),
                    Err(_) => true,
                };
                if remove {
                    fs::remove_dir_all(&path)?;
                }
            }
        }

        Ok(())
    }

    pub fn initialize_session(&self, algorithm: AlgorithmConfig) -> Result<String> {
        let id = Uuid::now_v7().to_string();
        let session = SessionConfig {
            app_version: env!("CARGO_PKG_VERSION").to_string(),
            modified_app_version: env!("CARGO_PKG_VERSION").to_string(),
            session_id: id.clone(),
            created_at: chrono::Utc::now(),
            modified_at: chrono::Utc::now(),
            discovered_fonts: HashMap::new(),
            algorithm,
            status: ProcessingStatus::default(),
        };

        let processing_dir = Self::get_session_processing_dir(&id)?;
        fs::create_dir_all(processing_dir.join("samples")).map_err(|e| {
            crate::error::AppError::Io(format!(
                "Failed to create session processing dir {}: {}",
                processing_dir.display(),
                e
            ))
        })?;
        write_session_config_atomic(&session, &processing_dir)?;

        let mut guard = self.current_session.lock().unwrap();
        *guard = Some(session);

        println!("🚀 New session initialized!");
        println!("📂 Session ID: {}", id);
        println!(
            "📍 Absolute Path: {}",
            processing_dir
                .canonicalize()
                .unwrap_or(processing_dir)
                .display()
        );

        Ok(id)
    }

    pub fn load_session(&self, id: &str) -> Result<()> {
        let session_dir = Self::ensure_session_view(id)?;
        let session = read_session_config_from_dir(&session_dir)?;
        let mut guard = self.current_session.lock().unwrap();
        *guard = Some(session);
        Ok(())
    }

    pub fn load_session_for_processing(&self, id: &str) -> Result<()> {
        let _guard = session_view_lock()
            .lock()
            .map_err(|_| crate::error::AppError::Processing("Session view lock poisoned".into()))?;

        let processing_dir = Self::get_session_processing_dir(id)?;
        let document_path = Self::get_session_document_path(id)?;

        if !has_session_config(&processing_dir) {
            if !document_path.exists() {
                return Err(crate::error::AppError::Processing(format!(
                    "Session {} not found",
                    id
                )));
            }
            if processing_dir.exists() {
                remove_dir_all_best_effort(&processing_dir);
            }
            let current_dir = Self::get_session_current_dir(id)?;
            if current_dir.exists() {
                remove_dir_all_best_effort(&current_dir);
            }
            fs::create_dir_all(&processing_dir).map_err(|e| {
                crate::error::AppError::Io(format!(
                    "Failed to create session processing dir {}: {}",
                    processing_dir.display(),
                    e
                ))
            })?;
            extract_document_to_dir(&document_path, &processing_dir)?;
        }

        let session = read_session_config_from_dir(&processing_dir)?;
        let mut current = self.current_session.lock().unwrap();
        *current = Some(session);
        Ok(())
    }

    pub fn finalize_session(&self, id: &str) -> Result<()> {
        let processing_dir = Self::get_session_processing_dir(id)?;
        if !processing_dir.exists() {
            return Err(crate::error::AppError::Processing(format!(
                "Cannot finalize session {}: processing dir does not exist",
                id
            )));
        }
        let document_path = Self::get_session_document_path(id)?;
        pack_dir_to_document(&processing_dir, &document_path)?;
        remove_dir_all_best_effort(&processing_dir);
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
        algorithm: AlgorithmConfigPatch,
        status: Option<ProcessStatus>,
    ) -> Result<()> {
        self.update_session(|session| {
            let update_clustering_only = matches!(
                status,
                Some(ProcessStatus::Rendered | ProcessStatus::Analyzed | ProcessStatus::Positioned)
            );

            if !update_clustering_only {
                if let Some(rendering) = algorithm.rendering {
                    session.algorithm.rendering = rendering;
                }
            }
            if let Some(clustering) = algorithm.clustering {
                session.algorithm.clustering = clustering;
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
        let processing_dir = Self::get_session_processing_dir(&session.session_id)?;
        if !processing_dir.exists() {
            return Err(crate::error::AppError::Processing(format!(
                "Cannot save session {}: processing dir does not exist",
                session.session_id
            )));
        }
        write_session_config_atomic(session, &processing_dir)
    }
}

fn has_session_config(dir: &Path) -> bool {
    dir.join(SESSION_CONFIG_FILE).exists()
}

fn remove_dir_all_best_effort(path: &Path) {
    let Ok(metadata) = fs::symlink_metadata(path) else {
        return;
    };

    if !metadata.is_dir() {
        if let Err(error) = fs::remove_file(path) {
            eprintln!(
                "⚠️ Failed to remove {} (will be cleaned at next startup): {}",
                path.display(),
                error
            );
        }
        return;
    }

    if fs::remove_dir_all(path).is_ok() {
        return;
    }
    let parent = match path.parent() {
        Some(parent) => parent,
        None => return,
    };
    let file_name = match path.file_name().and_then(|name| name.to_str()) {
        Some(name) => name,
        None => return,
    };
    let trash_path = parent.join(format!(".{file_name}.removing-{}", Uuid::now_v7()));
    if fs::rename(path, &trash_path).is_err() {
        eprintln!(
            "⚠️ Failed to remove directory {} (will be cleaned at next startup)",
            path.display()
        );
        return;
    }
    if let Err(error) = fs::remove_dir_all(&trash_path) {
        eprintln!(
            "⚠️ Failed to remove renamed directory {} (will be cleaned at next startup): {}",
            trash_path.display(),
            error
        );
    }
}

fn progress_section_mut(
    progress: &mut ProcessingProgress,
    stage: ProgressStage,
) -> &mut ProgressSection {
    match stage {
        ProgressStage::Rendering => &mut progress.rendering,
        ProgressStage::Analysis => &mut progress.analysis,
        ProgressStage::Clustering => &mut progress.clustering,
        ProgressStage::Position => &mut progress.position,
    }
}

pub fn is_session_document_path(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension == SESSION_DOCUMENT_EXTENSION)
}

fn parse_session_version(session: &SessionConfig) -> std::result::Result<Version, semver::Error> {
    Version::parse(session.modified_app_version.trim_start_matches('v'))
        .or_else(|_| Version::parse(session.app_version.trim_start_matches('v')))
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
    let mut config = archive.by_name(SESSION_CONFIG_FILE).map_err(|e| {
        crate::error::AppError::Processing(format!(
            "Session document {} does not contain {}: {}",
            path.display(),
            SESSION_CONFIG_FILE,
            e
        ))
    })?;
    let mut content = String::new();
    config.read_to_string(&mut content).map_err(|e| {
        crate::error::AppError::Io(format!(
            "Failed to read {} from {}: {}",
            SESSION_CONFIG_FILE,
            path.display(),
            e
        ))
    })?;
    Ok(serde_json::from_str(&content)?)
}

pub fn read_session_config_from_dir(dir: &Path) -> Result<SessionConfig> {
    let config_path = dir.join(SESSION_CONFIG_FILE);
    let content = fs::read_to_string(&config_path).map_err(|e| {
        crate::error::AppError::Io(format!(
            "Failed to read session config {}: {}",
            config_path.display(),
            e
        ))
    })?;
    Ok(serde_json::from_str(&content)?)
}

fn write_session_config_atomic(session: &SessionConfig, dir: &Path) -> Result<()> {
    fs::create_dir_all(dir).map_err(|e| {
        crate::error::AppError::Io(format!(
            "Failed to create session dir {}: {}",
            dir.display(),
            e
        ))
    })?;
    let content = serde_json::to_string_pretty(session)?;
    let mut temporary = tempfile::NamedTempFile::new_in(dir).map_err(|e| {
        crate::error::AppError::Io(format!(
            "Failed to create temporary session config in {}: {}",
            dir.display(),
            e
        ))
    })?;
    temporary
        .as_file_mut()
        .write_all(content.as_bytes())
        .map_err(|e| {
            crate::error::AppError::Io(format!("Failed to write temporary session config: {}", e))
        })?;
    let config_path = dir.join(SESSION_CONFIG_FILE);
    temporary.persist(&config_path).map_err(|e| {
        crate::error::AppError::Io(format!(
            "Failed to persist session config {}: {}",
            config_path.display(),
            e
        ))
    })?;
    Ok(())
}

fn extract_document_to_dir(document_path: &Path, dir: &Path) -> Result<()> {
    let file = fs::File::open(document_path).map_err(|e| {
        crate::error::AppError::Io(format!(
            "Failed to open session document {}: {}",
            document_path.display(),
            e
        ))
    })?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| {
        crate::error::AppError::Processing(format!(
            "Invalid session document {}: {}",
            document_path.display(),
            e
        ))
    })?;

    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| {
            crate::error::AppError::Processing(format!(
                "Failed to read entry {} from {}: {}",
                i,
                document_path.display(),
                e
            ))
        })?;
        let Some(enclosed) = entry.enclosed_name().map(|path| path.to_owned()) else {
            continue;
        };
        let output_path = dir.join(enclosed);
        if entry.name().ends_with('/') {
            fs::create_dir_all(&output_path)?;
            continue;
        }
        if let Some(parent) = output_path.parent() {
            fs::create_dir_all(parent)?;
        }
        let mut output = fs::File::create(&output_path).map_err(|e| {
            crate::error::AppError::Io(format!(
                "Failed to write extracted file {}: {}",
                output_path.display(),
                e
            ))
        })?;
        std::io::copy(&mut entry, &mut output)?;
    }
    Ok(())
}

fn pack_dir_to_document(dir: &Path, document_path: &Path) -> Result<()> {
    let parent = document_path
        .parent()
        .ok_or_else(|| crate::error::AppError::Io("Document path has no parent".into()))?;
    fs::create_dir_all(parent).map_err(|e| {
        crate::error::AppError::Io(format!(
            "Failed to create Generated dir {}: {}",
            parent.display(),
            e
        ))
    })?;
    let temporary = tempfile::NamedTempFile::new_in(parent).map_err(|e| {
        crate::error::AppError::Io(format!(
            "Failed to create temporary session document in {}: {}",
            parent.display(),
            e
        ))
    })?;
    {
        let mut writer = zip::ZipWriter::new(temporary.as_file());
        let options =
            SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);

        let mut entries: Vec<PathBuf> = WalkDir::new(dir)
            .into_iter()
            .filter_map(|entry| entry.ok())
            .filter(|entry| entry.file_type().is_file())
            .map(|entry| entry.path().to_path_buf())
            .collect();
        entries.sort();

        for path in entries {
            let relative_path = path.strip_prefix(dir).map_err(|e| {
                crate::error::AppError::Processing(format!(
                    "Failed to build relative path for {}: {}",
                    path.display(),
                    e
                ))
            })?;
            let entry_name = relative_path
                .components()
                .map(|component| component.as_os_str().to_string_lossy().into_owned())
                .collect::<Vec<_>>()
                .join("/");
            writer.start_file(&entry_name, options).map_err(|e| {
                crate::error::AppError::Processing(format!(
                    "Failed to start zip entry {}: {}",
                    entry_name, e
                ))
            })?;
            let mut file = fs::File::open(&path).map_err(|e| {
                crate::error::AppError::Io(format!(
                    "Failed to open {} for packing: {}",
                    path.display(),
                    e
                ))
            })?;
            std::io::copy(&mut file, &mut writer)?;
        }
        writer.finish().map_err(|e| {
            crate::error::AppError::Processing(format!(
                "Failed to finish session document {}: {}",
                document_path.display(),
                e
            ))
        })?;
    }
    temporary.persist(document_path).map_err(|e| {
        crate::error::AppError::Io(format!(
            "Failed to persist session document {}: {}",
            document_path.display(),
            e
        ))
    })?;
    Ok(())
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
