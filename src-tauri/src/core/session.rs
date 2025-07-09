use crate::error::{FontResult, FontError};
use std::path::PathBuf;
use std::fs;
use std::sync::RwLock;
use uuid::Uuid;

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
        let session_id = Uuid::now_v7().to_string();
        let base_dir = Self::get_base_data_dir()?;
        
        let session_manager = Self {
            session_id,
            base_dir,
        };
        
        // Create the session directory structure
        session_manager.create_session_directories()?;
        
        Ok(session_manager)
    }
    
    /// Create a default session (fallback)
    pub fn default() -> FontResult<Self> {
        let session_id = "default".to_string();
        let base_dir = Self::get_base_data_dir()?;
        
        let session_manager = Self {
            session_id,
            base_dir,
        };
        
        // Create the session directory structure
        session_manager.create_session_directories()?;
        
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
    
    /// Create all necessary directories for this session
    fn create_session_directories(&self) -> FontResult<()> {
        let session_dir = self.get_session_dir();
        
        // Create subdirectories
        let images_dir = session_dir.join("Images");
        let vectors_dir = session_dir.join("Vectors");
        let compressed_vectors_dir = session_dir.join("CompressedVectors");
        
        fs::create_dir_all(&images_dir)?;
        fs::create_dir_all(&vectors_dir)?;
        fs::create_dir_all(&compressed_vectors_dir)?;
        
        println!("Created session directories for session: {}", self.session_id);
        println!("  Images: {}", images_dir.display());
        println!("  Vectors: {}", vectors_dir.display());
        println!("  CompressedVectors: {}", compressed_vectors_dir.display());
        
        Ok(())
    }
    
    /// Get the Images directory for this session
    pub fn get_images_directory(&self) -> PathBuf {
        self.get_session_dir().join("Images")
    }
    
    /// Get the Vectors directory for this session
    pub fn get_vectors_directory(&self) -> PathBuf {
        self.get_session_dir().join("Vectors")
    }
    
    /// Get the CompressedVectors directory for this session
    pub fn get_compressed_vectors_directory(&self) -> PathBuf {
        self.get_session_dir().join("CompressedVectors")
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