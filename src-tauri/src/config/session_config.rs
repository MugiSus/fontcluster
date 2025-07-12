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
    /// Whether images have been generated for this session
    #[serde(default)]
    pub has_images: bool,
    /// Whether vectors have been generated for this session
    #[serde(default)]
    pub has_vectors: bool,
    /// Whether vectors have been compressed for this session
    #[serde(default)]
    pub has_compressed: bool,
    /// Whether clustering has been completed for this session
    #[serde(default)]
    pub has_clusters: bool,
}

impl SessionConfig {
    /// Creates a new session config
    pub fn new(preview_text: String, session_id: String) -> Self {
        Self {
            preview_text,
            date: Utc::now(),
            session_id,
            has_images: false,
            has_vectors: false,
            has_compressed: false,
            has_clusters: false,
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

    /// Updates the progress flags and saves the config
    pub fn update_progress(&mut self, session_dir: &Path, images: Option<bool>, vectors: Option<bool>, compressed: Option<bool>, clusters: Option<bool>) -> FontResult<()> {
        if let Some(val) = images { self.has_images = val; }
        if let Some(val) = vectors { self.has_vectors = val; }
        if let Some(val) = compressed { self.has_compressed = val; }
        if let Some(val) = clusters { self.has_clusters = val; }
        self.save_to_dir(session_dir)
    }

    /// Marks images as completed
    pub fn mark_images_completed(&mut self, session_dir: &Path) -> FontResult<()> {
        self.has_images = true;
        self.save_to_dir(session_dir)
    }

    /// Marks vectors as completed
    pub fn mark_vectors_completed(&mut self, session_dir: &Path) -> FontResult<()> {
        self.has_vectors = true;
        self.save_to_dir(session_dir)
    }

    /// Marks compression as completed
    pub fn mark_compressed_completed(&mut self, session_dir: &Path) -> FontResult<()> {
        self.has_compressed = true;
        self.save_to_dir(session_dir)
    }

    /// Marks clustering as completed
    pub fn mark_clusters_completed(&mut self, session_dir: &Path) -> FontResult<()> {
        self.has_clusters = true;
        self.save_to_dir(session_dir)
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

        Ok(SessionInfo {
            session_id: config.session_id,
            preview_text: config.preview_text,
            date: config.date,
            has_images: config.has_images,
            has_vectors: config.has_vectors,
            has_compressed: config.has_compressed,
            has_clusters: config.has_clusters,
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