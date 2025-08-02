//! Session configuration structures and utilities

use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc};
use std::path::Path;
use crate::error::{FontResult, FontError};

/// Session data stored in Generated/<sessionID>/config.json
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionData {
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
    /// Number of clusters found during the session
    #[serde(default)]
    pub clusters_amount: usize,
    /// Number of samples processed during the session
    #[serde(default)]
    pub samples_amount: usize,
    /// Font weights used in this session
    #[serde(default)]
    pub weights: Vec<i32>,
}

impl SessionData {
    /// Creates a new session config
    pub fn new(preview_text: String, session_id: String, weights: Vec<i32>) -> Self {
        Self {
            preview_text,
            date: Utc::now(),
            session_id,
            has_images: false,
            has_vectors: false,
            has_compressed: false,
            has_clusters: false,
            clusters_amount: 0,
            samples_amount: 0,
            weights,
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

        let config: SessionData = serde_json::from_str(&json)
            .map_err(|e| FontError::Io(std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                format!("Failed to deserialize session config: {}", e)
            )))?;

        Ok(config)
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

    /// Updates the number of clusters found
    pub fn update_clusters_amount(&mut self, session_dir: &Path, amount: usize) -> FontResult<()> {
        self.clusters_amount = amount;
        self.save_to_dir(session_dir)
    }

    pub fn update_samples_amount(&mut self, session_dir: &Path, amount: usize) -> FontResult<()> {
        self.samples_amount = amount;
        self.save_to_dir(session_dir)
    }
}

/// Session config for UI display
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionConfig {
    pub session_id: String,
    pub preview_text: String,
    pub date: DateTime<Utc>,
    pub has_images: bool,
    pub has_vectors: bool,
    pub has_compressed: bool,
    pub has_clusters: bool,
    pub clusters_amount: usize,
    pub samples_amount: usize,
    pub weights: Vec<i32>,
}

impl SessionConfig {
    /// Creates session info from a session directory
    pub fn from_session_dir(session_dir: &Path) -> FontResult<Self> {
        let config = SessionData::load_from_dir(session_dir)?;

        Ok(SessionConfig {
            session_id: config.session_id,
            preview_text: config.preview_text,
            date: config.date,
            has_images: config.has_images,
            has_vectors: config.has_vectors,
            has_compressed: config.has_compressed,
            has_clusters: config.has_clusters,
            clusters_amount: config.clusters_amount,
            samples_amount: config.samples_amount,
            weights: config.weights,
        })
    }
}