use crate::error::{FontResult, FontError};
use crate::config::{FontConfig, SessionConfig, SessionInfo};
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
    
    /// Get the current session ID
    pub fn get_session_id(&self) -> &str {
        &self.session_id
    }
    
    /// Get session directory for a specific session ID without changing global state
    pub fn get_session_dir_for_id(session_id: &str) -> FontResult<PathBuf> {
        let temp_session = Self::with_id(session_id.to_string())?;
        Ok(temp_session.get_session_dir())
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
            // Try to use the latest existing session, otherwise use default
            drop(session_guard);
            
            if let Ok(Some(latest_session_id)) = Self::get_latest_session_id() {
                // Set the latest session as global and return it
                if let Ok(latest_session) = Self::with_id(latest_session_id) {
                    let mut session_guard = SESSION_MANAGER.write().unwrap();
                    let session_copy = SessionManager {
                        session_id: latest_session.session_id.clone(),
                        base_dir: latest_session.base_dir.clone(),
                    };
                    *session_guard = Some(latest_session);
                    return session_copy;
                }
            }
            
            // Fallback to default session if no valid sessions exist
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
    
    /// Create a new session with preview text and save session config
    pub fn create_new_session_with_text(preview_text: String) -> FontResult<String> {
        Self::create_new_session_with_text_and_weights(preview_text, vec![400])
    }
    
    /// Create a new session with preview text and weights
    pub fn create_new_session_with_text_and_weights(preview_text: String, weights: Vec<i32>) -> FontResult<String> {
        let session_id = Uuid::now_v7().to_string();
        let new_session = Self::with_id(session_id.clone())?;
        
        // Save session configuration
        let session_config = SessionConfig::new(preview_text, session_id.clone(), weights);
        session_config.save_to_dir(&new_session.get_session_dir())?;
        
        let mut session_guard = SESSION_MANAGER.write().unwrap();
        *session_guard = Some(new_session);
        
        Ok(session_id)
    }
    
    /// Restore a session by ID
    pub fn restore_session(session_id: String) -> FontResult<()> {
        let session = Self::with_id(session_id)?;
        
        // Verify session config exists
        let session_dir = session.get_session_dir();
        SessionConfig::load_from_dir(&session_dir)?;
        
        let mut session_guard = SESSION_MANAGER.write().unwrap();
        *session_guard = Some(session);
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
    pub fn create_font_directory(&self, safe_font_name: &str, font_name: &str, family_name: &str, weight: i32) -> FontResult<PathBuf> {
        let font_dir = self.get_font_directory(safe_font_name);
        fs::create_dir_all(&font_dir)?;
        
        let config = FontConfig::new(
            safe_font_name.to_string(),
            font_name.to_string(),
            family_name.to_string(),
            weight
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
    
    /// Get all available sessions sorted by date (newest first)
    pub fn get_available_sessions(max_sessions: Option<usize>) -> FontResult<Vec<SessionInfo>> {
        let base_dir = Self::get_base_data_dir()?;
        let generated_dir = base_dir.join("Generated");
        
        if !generated_dir.exists() {
            return Ok(Vec::new());
        }
        
        let mut sessions = Vec::new();
        
        for entry in fs::read_dir(&generated_dir)? {
            let entry = entry?;
            let path = entry.path();
            
            if path.is_dir() {
                if let Some(dir_name) = path.file_name().and_then(|n| n.to_str()) {
                    // Skip default directory
                    if dir_name == "default" {
                        continue;
                    }
                    
                    // Try to load session info
                    if let Ok(session_info) = SessionInfo::from_session_dir(&path) {
                        sessions.push(session_info);
                    }
                }
            }
        }
        
        // Sort by date (newest first)
        sessions.sort_by(|a, b| b.date.cmp(&a.date));
        
        // Limit to max_sessions if specified
        if let Some(max) = max_sessions {
            sessions.truncate(max);
        }
        
        Ok(sessions)
    }
    
    /// Get current session info
    pub fn get_current_session_info(&self) -> FontResult<Option<SessionInfo>> {
        let session_dir = self.get_session_dir();
        if session_dir.join("config.json").exists() {
            Ok(Some(SessionInfo::from_session_dir(&session_dir)?))
        } else {
            Ok(None)
        }
    }

    /// Get the session ID of the most recent session (by UUIDv7 timestamp)
    pub fn get_latest_session_id() -> FontResult<Option<String>> {
        let base_dir = Self::get_base_data_dir()?;
        let generated_dir = base_dir.join("Generated");
        
        if !generated_dir.exists() {
            return Ok(None);
        }
        
        let mut session_ids = Vec::new();
        
        for entry in fs::read_dir(&generated_dir)? {
            let entry = entry?;
            let path = entry.path();
            
            if path.is_dir() {
                if let Some(dir_name) = path.file_name().and_then(|n| n.to_str()) {
                    // Skip default directory and only consider valid UUIDs
                    if dir_name != "default" && Uuid::parse_str(dir_name).is_ok() {
                        // Verify this session has a config.json
                        if path.join("config.json").exists() {
                            session_ids.push(dir_name.to_string());
                        }
                    }
                }
            }
        }
        
        if session_ids.is_empty() {
            return Ok(None);
        }
        
        // Sort by UUIDv7 timestamp (newest first)
        session_ids.sort_by(|a, b| {
            let uuid_a = Uuid::parse_str(a).unwrap();
            let uuid_b = Uuid::parse_str(b).unwrap();
            uuid_b.cmp(&uuid_a) // Reverse order for newest first
        });
        
        Ok(Some(session_ids[0].clone()))
    }
}