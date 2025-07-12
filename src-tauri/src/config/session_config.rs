//! Session configuration structures and utilities

use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc};
use std::path::Path;
use crate::error::{FontResult, FontError};

/// Session configuration stored in Generated/<sessionID>/config.json
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionConfig {
    /// Preview text used for this session
    pub preview_text: String,
    /// Session creation date in ISO string format
    pub date: DateTime<Utc>,
    /// Session ID (UUID v7)
    pub session_id: String,
}

impl SessionConfig {
    /// Creates a new session config
    pub fn new(preview_text: String, session_id: String) -> Self {
        Self {
            preview_text,
            date: Utc::now(),
            session_id,
        }
    }

    /// Saves the session config to the specified directory
    pub fn save_to_dir(&self, session_dir: &Path) -> FontResult<()> {
        let config_path = session_dir.join("config.json");
        let json = serde_json::to_string_pretty(self)
            .map_err(|e| FontError::Io(std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                format!("Failed to serialize session config: {}", e)
            )))?;

        std::fs::write(&config_path, json)
            .map_err(|e| FontError::Io(e.into()))?;

        Ok(())
    }

    /// Loads session config from the specified directory
    pub fn load_from_dir(session_dir: &Path) -> FontResult<Self> {
        let config_path = session_dir.join("config.json");
        
        let json = std::fs::read_to_string(&config_path)
            .map_err(|e| FontError::Io(e.into()))?;

        let config: SessionConfig = serde_json::from_str(&json)
            .map_err(|e| FontError::Io(std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                format!("Failed to deserialize session config: {}", e)
            )))?;

        Ok(config)
    }
}

/// Session info for UI display
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionInfo {
    pub session_id: String,
    pub preview_text: String,
    pub date: DateTime<Utc>,
    pub has_images: bool,
    pub has_vectors: bool,
    pub has_compressed: bool,
    pub has_clusters: bool,
}

impl SessionInfo {
    /// Creates session info from a session directory
    pub fn from_session_dir(session_dir: &Path) -> FontResult<Self> {
        let config = SessionConfig::load_from_dir(session_dir)?;

        // Check what processing steps have been completed
        let has_images = session_dir.join("images").exists();
        let has_vectors = session_dir.join("vectors").exists();
        let has_compressed = session_dir.join("compressed_vectors.json").exists();
        let has_clusters = session_dir.join("clustered_compressed_vectors.json").exists();

        Ok(SessionInfo {
            session_id: config.session_id,
            preview_text: config.preview_text,
            date: config.date,
            has_images,
            has_vectors,
            has_compressed,
            has_clusters,
        })
    }

    /// Gets the completion percentage of this session
    pub fn completion_percentage(&self) -> u8 {
        let steps = [
            self.has_images,
            self.has_vectors,
            self.has_compressed,
            self.has_clusters,
        ];
        let completed = steps.iter().filter(|&&x| x).count();
        ((completed as f32 / steps.len() as f32) * 100.0) as u8
    }

    /// Gets a human-readable status description
    pub fn status_description(&self) -> String {
        match (self.has_images, self.has_vectors, self.has_compressed, self.has_clusters) {
            (false, _, _, _) => "Not processed".to_string(),
            (true, false, _, _) => "Images generated".to_string(),
            (true, true, false, _) => "Vectors generated".to_string(),
            (true, true, true, false) => "Vectors compressed".to_string(),
            (true, true, true, true) => "Fully processed".to_string(),
        }
    }
}