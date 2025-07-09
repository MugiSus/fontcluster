use crate::core::FontService;

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
/// Returns a vector of tuples containing (font_name, x_coordinate, y_coordinate)
/// for plotting fonts in a 2D space after PCA compression.
/// 
/// # Returns
/// - `Ok(Vec<(String, f64, f64)>)` - List of font coordinates
/// - `Err(String)` - Error message if reading fails
#[tauri::command]
pub fn get_compressed_vectors() -> Result<Vec<(String, f64, f64)>, String> {
    FontService::read_compressed_vectors()
        .map_err(|e| format!("Failed to read compressed vectors: {}", e))
}