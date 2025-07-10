use crate::core::SessionManager;

/// Session management commands for the frontend
/// 
/// These commands provide the frontend with access to session information
/// and allow for session-based operations.

/// Get the current session ID
/// 
/// Returns the UUIDv7 session identifier that can be used by the frontend
/// to construct file paths and identify the current session.
#[tauri::command]
pub fn get_session_id() -> String {
    SessionManager::global().session_id().to_string()
}

/// Get the session directory path
/// 
/// Returns the full path to the current session's directory structure.
/// This is useful for debugging and frontend path construction.
#[tauri::command]
pub fn get_session_directory() -> String {
    SessionManager::global().get_session_dir().to_string_lossy().to_string()
}

/// Create a new session for processing
/// 
/// Creates a new UUIDv7 session and sets it as the active session.
/// This should be called when starting a new clustering operation.
#[tauri::command]
pub fn create_new_session() -> Result<String, String> {
    SessionManager::create_new_session()
        .map(|_| {
            let session = SessionManager::global();
            format!("New session created: {}", session.session_id())
        })
        .map_err(|e| format!("Failed to create new session: {}", e))
}

/// Clean up old sessions
/// 
/// Removes session directories older than the specified number of days.
/// This helps manage disk space by removing stale session data.
#[tauri::command]
pub fn cleanup_old_sessions(max_age_days: u64) -> Result<String, String> {
    SessionManager::global()
        .cleanup_old_sessions(max_age_days)
        .map(|_| format!("Successfully cleaned up sessions older than {} days", max_age_days))
        .map_err(|e| format!("Failed to clean up old sessions: {}", e))
}

/// Get all font configurations in the current session
/// 
/// Returns a list of FontConfig objects that exist in the current session.
/// This avoids multiple find operations by returning all configs directly.
#[tauri::command]
pub fn get_session_fonts() -> Result<String, String> {
    SessionManager::global()
        .load_all_font_configs()
        .and_then(|configs| {
            serde_json::to_string(&configs)
                .map_err(|e| crate::error::FontError::Io(std::io::Error::new(
                    std::io::ErrorKind::InvalidData,
                    format!("Failed to serialize font configs: {}", e)
                )))
        })
        .map_err(|e| format!("Failed to get session fonts: {}", e))
}