use crate::error::{FontResult, FontError};
use crate::config::FontConfig;
use std::path::PathBuf;
use std::fs;
use std::sync::RwLock;
use uuid::Uuid;
use std::io::Write;

/// Session management for font processing
/// 
/// Each session gets a unique UUIDv7 identifier and creates its own directory structure
/// under Generated/<session_id>/ with subdirectories for Images, Vectors, and CompressedVectors.
/// On application start, uses 'default' as fallback until a new session is created.
pub struct SessionManager {
    session_id: String,
    base_dir: PathBuf,
}

static SESSION_MANAGER: RwLock<Option<SessionManager>> = RwLock::new(None);

impl SessionManager {
    /// Create a new session with a UUIDv7 identifier
    pub fn new() -> FontResult<Self> {
        Self::with_id(Uuid::now_v7().to_string())
    }
    
    /// Create a default session (fallback)
    pub fn default() -> FontResult<Self> {
        Self::with_id("default".to_string())
    }
    
    /// Create session with specific ID
    fn with_id(session_id: String) -> FontResult<Self> {
        let session_manager = Self {
            session_id,
            base_dir: Self::get_base_data_dir()?,
        };
        
        fs::create_dir_all(session_manager.get_session_dir())?;
        Ok(session_manager)
    }
    
    /// Get the global session manager instance
    pub fn global() -> SessionManager {
        let session_guard = SESSION_MANAGER.read().unwrap();
        if let Some(session) = session_guard.as_ref() {
            // Return a copy of the current session
            SessionManager {
                session_id: session.session_id.clone(),
                base_dir: session.base_dir.clone(),
            }
        } else {
            // Return default session if no session is active
            drop(session_guard);
            Self::default().expect("Failed to create default session")
        }
    }
    
    /// Create a new session and set it as the global session
    pub fn create_new_session() -> FontResult<()> {
        let new_session = Self::new()?;
        let mut session_guard = SESSION_MANAGER.write().unwrap();
        *session_guard = Some(new_session);
        Ok(())
    }
    
    /// Get the session ID
    pub fn session_id(&self) -> &str {
        &self.session_id
    }
    
    /// Get the base application data directory
    fn get_base_data_dir() -> FontResult<PathBuf> {
        dirs::data_dir()
            .ok_or_else(|| FontError::Io(std::io::Error::new(
                std::io::ErrorKind::NotFound,
                "Failed to get app data directory"
            )))
            .map(|dir| dir.join("FontCluster"))
    }
    
    /// Get the session-specific directory
    pub fn get_session_dir(&self) -> PathBuf {
        self.base_dir.join("Generated").join(&self.session_id)
    }
    
    
    /// Get the directory for a specific font
    pub fn get_font_directory(&self, safe_font_name: &str) -> PathBuf {
        self.get_session_dir().join(safe_font_name)
    }
    
    /// Create directory structure for a specific font and its config
    pub fn create_font_directory(&self, safe_font_name: &str, display_name: &str, family_name: &str) -> FontResult<PathBuf> {
        let font_dir = self.get_font_directory(safe_font_name);
        fs::create_dir_all(&font_dir)?;
        
        let config = FontConfig::new(
            safe_font_name.to_string(),
            display_name.to_string(), 
            family_name.to_string()
        );
        self.save_font_config(safe_font_name, &config)?;
        
        Ok(font_dir)
    }
    
    /// Get the path to a specific font's configuration file
    pub fn get_font_config_path(&self, safe_font_name: &str) -> PathBuf {
        self.get_font_directory(safe_font_name).join("config.json")
    }
    
    
    /// Save font configuration to individual JSON file
    pub fn save_font_config(&self, safe_font_name: &str, config: &FontConfig) -> FontResult<()> {
        let config_path = self.get_font_config_path(safe_font_name);
        let json_content = serde_json::to_string_pretty(config)
            .map_err(|e| FontError::Io(std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                format!("Failed to serialize font config: {}", e)
            )))?;
        
        let mut file = fs::File::create(&config_path)?;
        file.write_all(json_content.as_bytes())?;
        
        println!("Saved font configuration: {}", config_path.display());
        Ok(())
    }
    
    /// Load configuration for a specific font
    pub fn load_font_config(&self, safe_font_name: &str) -> FontResult<Option<FontConfig>> {
        let config_path = self.get_font_config_path(safe_font_name);
        
        if !config_path.exists() {
            return Ok(None);
        }
        
        let content = fs::read_to_string(&config_path)?;
        let config: FontConfig = serde_json::from_str(&content)
            .map_err(|e| FontError::Io(std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                format!("Failed to parse font config: {}", e)
            )))?;
        
        Ok(Some(config))
    }
    
    /// Get all font configurations by scanning font directories
    pub fn load_all_font_configs(&self) -> FontResult<Vec<FontConfig>> {
        let session_dir = self.get_session_dir();
        
        if !session_dir.exists() {
            return Ok(Vec::new());
        }
        
        Ok(fs::read_dir(&session_dir)?
            .filter_map(|entry| entry.ok())
            .filter(|entry| entry.path().is_dir())
            .filter_map(|entry| {
                entry.file_name().to_str()
                    .and_then(|name| self.load_font_config(name).ok())
                    .flatten()
            })
            .collect())
    }
    
    /// Clean up old sessions (optional utility method)
    pub fn cleanup_old_sessions(&self, max_age_days: u64) -> FontResult<()> {
        let generated_dir = self.base_dir.join("Generated");
        
        if !generated_dir.exists() {
            return Ok(());
        }
        
        let cutoff_time = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() - (max_age_days * 24 * 60 * 60);
        
        for entry in fs::read_dir(&generated_dir)? {
            let entry = entry?;
            let path = entry.path();
            
            if path.is_dir() {
                if let Some(dir_name) = path.file_name().and_then(|n| n.to_str()) {
                    // Skip default directory from cleanup
                    if dir_name == "default" {
                        continue;
                    }
                    
                    if let Ok(uuid) = Uuid::parse_str(dir_name) {
                        // Extract timestamp from UUIDv7
                        let timestamp = uuid.get_timestamp().unwrap().to_unix();
                        
                        if timestamp.0 < cutoff_time {
                            println!("Cleaning up old session: {}", dir_name);
                            fs::remove_dir_all(&path)?;
                        }
                    }
                }
            }
        }
        
        Ok(())
    }
}