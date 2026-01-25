use crate::config::{SessionConfig, FontMetadata, ProcessingStatus, AlgorithmConfig, ProcessStatus};
use crate::error::Result;
use std::path::{Path, PathBuf};
use std::collections::HashMap;
use std::fs;
use uuid::Uuid;
use std::sync::{Arc, Mutex};
use std::sync::atomic::AtomicBool;

#[derive(Clone)]
pub struct AppState {
    pub current_session: Arc<Mutex<Option<SessionConfig>>>,
    pub is_cancelled: Arc<AtomicBool>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            current_session: Arc::new(Mutex::new(None)),
            is_cancelled: Arc::new(AtomicBool::new(false)),
        }
    }

    pub fn get_base_dir() -> Result<PathBuf> {
        dirs::data_dir()
            .map(|d| d.join("FontCluster"))
            .ok_or_else(|| crate::error::AppError::Io("AppData not found".into()))
    }

    pub fn get_session_dir(&self) -> Result<PathBuf> {
        let guard = self.current_session.lock().map_err(|_| crate::error::AppError::Processing("Lock poisoned".into()))?;
        let session = guard.as_ref().ok_or_else(|| crate::error::AppError::Processing("No active session".into()))?;
        let path = Self::get_base_dir()?.join("Generated").join(&session.id);
        if !path.exists() {
            std::fs::create_dir_all(&path).map_err(|e| crate::error::AppError::Io(format!("Failed to create session dir {}: {}", path.display(), e)))?;
        }
        Ok(path)
    }

    pub fn initialize_session(&self, text: String, weights: Vec<i32>, algorithm: Option<AlgorithmConfig>) -> Result<String> {
        let id = Uuid::now_v7().to_string();
        let session = SessionConfig {
            app_version: env!("CARGO_PKG_VERSION").to_string(),
            modified_app_version: env!("CARGO_PKG_VERSION").to_string(),
            id: id.clone(),
            preview_text: text,
            created_at: chrono::Utc::now(),
            modified_at: chrono::Utc::now(),
            weights,
            discovered_fonts: HashMap::new(),
            algorithm,
            status: ProcessingStatus::default(),
        };

        let base_dir = Self::get_base_dir()?;
        let session_dir = base_dir.join("Generated").join(&id);
        fs::create_dir_all(&session_dir).map_err(|e| crate::error::AppError::Io(format!("Failed to create session dir {}: {}", session_dir.display(), e)))?;
        
        let config_path = session_dir.join("config.json");
        fs::write(&config_path, serde_json::to_string_pretty(&session)?).map_err(|e| crate::error::AppError::Io(format!("Failed to write session config {}: {}", config_path.display(), e)))?;

        let mut guard = self.current_session.lock().unwrap();
        *guard = Some(session);
        
        println!("🚀 New session initialized!");
        println!("📂 Session ID: {}", id);
        println!("📍 Absolute Path: {}", session_dir.canonicalize().unwrap_or(session_dir).display());
        
        Ok(id)
    }

    pub fn load_session(&self, id: &str) -> Result<()> {
        let session_dir = Self::get_base_dir()?.join("Generated").join(id);
        let config_path = session_dir.join("config.json");
        let session: SessionConfig = serde_json::from_str(&fs::read_to_string(&config_path).map_err(|e| crate::error::AppError::Io(format!("Failed to read session config {}: {}", config_path.display(), e)))?)?;
        
        let mut guard = self.current_session.lock().unwrap();
        *guard = Some(session);
        Ok(())
    }

    pub fn update_status<F>(&self, f: F) -> Result<()> 
    where F: FnOnce(&mut ProcessingStatus) {
        self.update_session(|session| {
            f(&mut session.status);
        })
    }

    pub fn update_session_config(&self, algorithm: Option<AlgorithmConfig>, status: Option<ProcessStatus>) -> Result<()> {
        self.update_session(|session| {
            if let Some(alg) = algorithm {
                session.algorithm = Some(alg);
            }
            if let Some(s) = status {
                session.status.process_status = s;
            }
        })
    }

    pub fn update_session<F>(&self, f: F) -> Result<()>
    where F: FnOnce(&mut SessionConfig) {
        let mut guard = self.current_session.lock().unwrap();
        if let Some(session) = guard.as_mut() {
            f(session);
            session.modified_at = chrono::Utc::now();
            session.modified_app_version = env!("CARGO_PKG_VERSION").to_string();
            self.save_session(session)?;
        }
        Ok(())
    }

    fn save_session(&self, session: &SessionConfig) -> Result<()> {
        let session_dir = Self::get_base_dir()?.join("Generated").join(&session.id);
        let config_path = session_dir.join("config.json");
        fs::write(&config_path, serde_json::to_string_pretty(session)?).map_err(|e| crate::error::AppError::Io(format!("Failed to write session config {}: {}", config_path.display(), e)))
    }
}

pub fn save_font_metadata(session_dir: &Path, meta: &FontMetadata) -> Result<()> {
    let font_dir = session_dir.join("samples").join(&meta.safe_name);
    fs::create_dir_all(&font_dir).map_err(|e| crate::error::AppError::Io(format!("Failed to create font dir {}: {}", font_dir.display(), e)))?;
    let meta_path = font_dir.join("meta.json");
    fs::write(&meta_path, serde_json::to_string_pretty(meta)?).map_err(|e| crate::error::AppError::Io(format!("Failed to save font metadata {}: {}", meta_path.display(), e)))?;
    Ok(())
}

pub fn load_font_metadata(session_dir: &Path, safe_name: &str) -> Result<FontMetadata> {
    let path = session_dir.join("samples").join(safe_name).join("meta.json");
    Ok(serde_json::from_str(&fs::read_to_string(&path).map_err(|e| crate::error::AppError::Io(format!("Failed to load font metadata {}: {}", path.display(), e)))?)?)
}