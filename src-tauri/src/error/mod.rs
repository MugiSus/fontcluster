use serde::Serialize;
use std::io;

pub type Result<T> = std::result::Result<T, AppError>;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("IO error: {0}")]
    Io(String),
    
    #[error("Font error: {0}")]
    Font(String),
    
    #[error("Image error: {0}")]
    Image(String),
    
    #[error("Processing error: {0}")]
    Processing(String),
    
    #[error("Serialization error: {0}")]
    Serialization(String),
    
    #[error("Tauri error: {0}")]
    Tauri(String),
}

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

impl From<font_kit::error::SelectionError> for AppError {
    fn from(e: font_kit::error::SelectionError) -> Self {
        AppError::Font(e.to_string())
    }
}

impl From<font_kit::error::FontLoadingError> for AppError {
    fn from(e: font_kit::error::FontLoadingError) -> Self {
        AppError::Font(e.to_string())
    }
}

impl From<font_kit::error::GlyphLoadingError> for AppError {
    fn from(e: font_kit::error::GlyphLoadingError) -> Self {
        AppError::Processing(e.to_string())
    }
}