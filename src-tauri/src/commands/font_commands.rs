use crate::core::{FontService, SessionManager};
use crate::error::FontResult;

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

/// Retrieves font configs with computed data for visualization
/// 
/// Returns a JSON string containing FontConfigRecord where font names are keys and values are FontConfig objects.
/// Format: { "font_name": FontConfig } where FontConfig includes optional computed field
#[tauri::command]
pub fn get_compressed_vectors(session_id: String) -> Result<String, String> {
    // Get session directory without changing global state
    let session_dir = SessionManager::get_session_dir_for_id(&session_id)
        .map_err(|e| format!("Failed to get session directory: {}", e))?;
        
    FontService::read_font_configs_for_session(session_dir)
        .map_err(|e| format!("Failed to read font configs: {}", e))
}

/// Get all fonts configurations from individual config.json files
/// 
/// Returns all font configurations found in the current session directory.
#[tauri::command]
pub fn get_fonts_config() -> Result<String, String> {
    || -> FontResult<String> {
        let session_manager = SessionManager::global();
        let configs = session_manager.load_all_font_configs()?;
        serde_json::to_string(&configs)
            .map_err(|e| crate::error::FontError::Io(std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                format!("Failed to serialize configs: {}", e)
            )))
    }()
    .map_err(|e| format!("Failed to get fonts config: {}", e))
}

/// Get configuration for a specific font by safe name
#[tauri::command]
pub fn get_font_config(safe_font_name: String) -> Result<Option<String>, String> {
    || -> FontResult<Option<String>> {
        let session_manager = SessionManager::global();
        let config_opt = session_manager.load_font_config(&safe_font_name)?;
        
        match config_opt {
            Some(config) => {
                let json = serde_json::to_string(&config)
                    .map_err(|e| crate::error::FontError::Io(std::io::Error::new(
                        std::io::ErrorKind::InvalidData,
                        format!("Failed to serialize config: {}", e)
                    )))?;
                Ok(Some(json))
            }
            None => Ok(None)
        }
    }()
    .map_err(|e| format!("Failed to get font config: {}", e))
}