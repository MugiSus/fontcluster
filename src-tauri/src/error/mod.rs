//! Application-wide error type.
//!
//! Every fallible operation in the backend returns [`Result<T>`], which is
//! [`std::result::Result`] specialised to [`AppError`]. The variants are
//! coarse on purpose: each one carries a human-readable message rather than a
//! structured payload, because errors ultimately cross the Tauri boundary as
//! plain strings (see the [`Serialize`] implementation).

use serde::Serialize;
use std::io;

/// Convenience alias for results returned throughout the backend.
pub type Result<T> = std::result::Result<T, AppError>;

/// The single error type surfaced by the backend.
///
/// Each variant wraps a pre-formatted message. The [`From`] implementations
/// below convert common third-party errors into the matching variant so that
/// call sites can rely on the `?` operator.
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("IO error: {0}")]
    Io(String),

    #[error("Font error: {0}")]
    Font(String),

    #[error("Missing glyph for character '{0}'")]
    MissingGlyph(char),

    #[error("Image error: {0}")]
    Image(String),

    #[error("Processing error: {0}")]
    Processing(String),

    #[error("Serialization error: {0}")]
    Serialization(String),

    #[error("Tauri error: {0}")]
    Tauri(String),

    #[error("Network error: {0}")]
    Network(String),
}

/// Serialises an error as its display string so it can be returned to the
/// frontend through a Tauri command result.
impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

impl From<io::Error> for AppError {
    fn from(e: io::Error) -> Self {
        AppError::Io(e.to_string())
    }
}

impl From<serde_json::Error> for AppError {
    fn from(e: serde_json::Error) -> Self {
        AppError::Serialization(e.to_string())
    }
}

impl From<tauri::Error> for AppError {
    fn from(e: tauri::Error) -> Self {
        AppError::Tauri(e.to_string())
    }
}

impl From<image::ImageError> for AppError {
    fn from(e: image::ImageError) -> Self {
        AppError::Image(e.to_string())
    }
}
