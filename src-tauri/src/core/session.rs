use crate::config::{SessionConfig, FontMetadata, ProcessingStatus, AlgorithmConfig, ProcessStatus};
use crate::error::Result;
use std::path::{Path, PathBuf};
use std::fs;
use uuid::Uuid;
use std::sync::Mutex;
use std::sync::atomic::AtomicBool;

pub struct AppState {
    pub current_session: Mutex<Option<SessionConfig>>,
    pub is_cancelled: AtomicBool,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            current_session: Mutex::new(None),
            is_cancelled: AtomicBool::new(false),
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
            std::fs::create_dir_all(&path)?;
        }
        Ok(path)
    }

    pub fn initialize_session(&self, text: String, weights: Vec<i32>, algorithm: Option<AlgorithmConfig>) -> Result<String> {
        let id = Uuid::now_v7().to_string();
        let session = SessionConfig {
            id: id.clone(),
            preview_text: text,
            date: chrono::Utc::now(),
            weights,
            algorithm,
            status: ProcessingStatus::default(),
        };

        let base_dir = Self::get_base_dir()?;
        let session_dir = base_dir.join("Generated").join(&id);
        fs::create_dir_all(&session_dir)?;
        
        let config_path = session_dir.join("config.json");
        fs::write(config_path, serde_json::to_string_pretty(&session)?)?;

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
        let session: SessionConfig = serde_json::from_str(&fs::read_to_string(config_path)?)?;
        
        let mut guard = self.current_session.lock().unwrap();
        *guard = Some(session);
        Ok(())
    }

    pub fn update_status<F>(&self, f: F) -> Result<()> 
    where F: FnOnce(&mut ProcessingStatus) {
        let mut guard = self.current_session.lock().unwrap();
        if let Some(session) = guard.as_mut() {
            f(&mut session.status);
            let session_dir = Self::get_base_dir()?.join("Generated").join(&session.id);
            fs::write(session_dir.join("config.json"), serde_json::to_string_pretty(&session)?)?;
        }
        Ok(())
    }

    pub fn update_session_config(&self, algorithm: Option<AlgorithmConfig>, status: Option<ProcessStatus>) -> Result<()> {
        let mut guard = self.current_session.lock().unwrap();
        if let Some(session) = guard.as_mut() {
            if let Some(alg) = algorithm {
                session.algorithm = Some(alg);
            }
            if let Some(s) = status {
                session.status.process_status = s;
            }
            let session_dir = Self::get_base_dir()?.join("Generated").join(&session.id);
            fs::write(session_dir.join("config.json"), serde_json::to_string_pretty(&session)?)?;
        }
        Ok(())
    }
}

pub fn save_font_metadata(session_dir: &Path, meta: &FontMetadata) -> Result<()> {
    let font_dir = session_dir.join(&meta.safe_name);
    fs::create_dir_all(&font_dir)?;
    fs::write(font_dir.join("meta.json"), serde_json::to_string_pretty(meta)?)?;
    Ok(())
}

pub fn load_font_metadata(session_dir: &Path, safe_name: &str) -> Result<FontMetadata> {
    let path = session_dir.join(safe_name).join("meta.json");
    Ok(serde_json::from_str(&fs::read_to_string(path)?)?)
}