use crate::core::{FontService, SessionManager, FontClassifier};

/// Tauri command handlers for font-related operations
/// 
/// This module provides the interface between the frontend and the core font services.
/// All commands here are thin wrappers around the core business logic.

/// Simple greeting command for testing Tauri communication
#[tauri::command]
pub fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

/// Retrieves the list of available system fonts
/// 
/// Returns a sorted, deduplicated list of font family names available on the system.
#[tauri::command]
pub fn get_system_fonts() -> Vec<String> {
    FontService::get_system_fonts()
}

/// Retrieves compressed 2D vectors for font visualization
/// 
/// Returns a JSON string containing a Map where font names are keys and values contain coordinates.
/// Format: { "font_name": { x: number, y: number, k: number, config: FontConfig } }
/// 
/// # Returns
/// - `Ok(String)` - JSON string containing font map with coordinates
/// - `Err(String)` - Error message if reading fails
#[tauri::command]
pub fn get_compressed_vectors() -> Result<String, String> {
    FontService::read_compressed_vectors()
        .map_err(|e| format!("Failed to read compressed vectors: {}", e))
}

/// Get all fonts configurations from individual config.json files
/// 
/// Returns all font configurations found in the current session directory.
/// 
/// # Returns
/// - `Ok(String)` - JSON string containing array of font configurations
/// - `Err(String)` - Error message if reading fails
#[tauri::command]
pub fn get_fonts_config() -> Result<String, String> {
    let session_manager = SessionManager::global();
    session_manager.load_all_font_configs()
        .and_then(|configs| {
            serde_json::to_string(&configs)
                .map_err(|e| crate::error::FontError::Io(std::io::Error::new(
                    std::io::ErrorKind::InvalidData,
                    format!("Failed to serialize configs: {}", e)
                )))
        })
        .map_err(|e| format!("Failed to get fonts config: {}", e))
}

/// Get configuration for a specific font by safe name
/// 
/// # Returns
/// - `Ok(Some(String))` - JSON string containing font configuration
/// - `Ok(None)` - Font configuration not found
/// - `Err(String)` - Error message if reading fails
#[tauri::command]
pub fn get_font_config(safe_font_name: String) -> Result<Option<String>, String> {
    let session_manager = SessionManager::global();
    session_manager.load_font_config(&safe_font_name)
        .and_then(|config_opt| {
            config_opt.map(|config| {
                serde_json::to_string(&config)
                    .map_err(|e| crate::error::FontError::Io(std::io::Error::new(
                        std::io::ErrorKind::InvalidData,
                        format!("Failed to serialize config: {}", e)
                    )))
            }).transpose()
        })
        .map_err(|e| format!("Failed to get font config: {}", e))
}

/// Classify a font using supervised learning
/// 
/// # Returns
/// - `Ok(String)` - Font category (sans-serif, serif, etc.)
/// - `Err(String)` - Error message if classification fails
#[tauri::command]
pub async fn classify_font(font_name: String) -> Result<String, String> {
    let classifier = FontClassifier::load_pretrained()
        .map_err(|e| format!("Failed to load classifier: {}", e))?;
    
    let category = classifier.classify_font(&font_name).await
        .map_err(|e| format!("Classification failed: {}", e))?;
    
    Ok(category.as_str().to_string())
}

/// Train the font classifier with Google Fonts data
/// 
/// # Returns
/// - `Ok(())` - Training completed successfully
/// - `Err(String)` - Error message if training fails
#[tauri::command]
pub async fn train_font_classifier() -> Result<(), String> {
    FontClassifier::full_training_process().await
        .map(|_| ())
        .map_err(|e| format!("Training failed: {}", e))
}