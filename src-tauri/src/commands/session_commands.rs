use crate::core::SessionManager;
use crate::error::FontResult;

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
/// Returns the full path to the specified session's directory structure.
/// This is useful for debugging and frontend path construction.
#[tauri::command]
pub fn get_session_directory(session_id: String) -> Result<String, String> {
    // Get session directory without changing global state
    let session_dir = SessionManager::get_session_dir_for_id(&session_id)
        .map_err(|e| format!("Failed to get session directory: {}", e))?;
        
    Ok(session_dir.to_string_lossy().to_string())
}

/// Create a new session for processing
/// 
/// Creates a new UUIDv7 session and sets it as the active session.
/// This should be called when starting a new clustering operation.
#[tauri::command]
pub fn create_new_session() -> Result<String, String> {
    || -> FontResult<String> {
        SessionManager::create_new_session()?;
        let session = SessionManager::global();
        Ok(format!("New session created: {}", session.session_id()))
    }()
    .map_err(|e| format!("Failed to create new session: {}", e))
}

/// Clean up old sessions
/// 
/// Removes session directories older than the specified number of days.
/// This helps manage disk space by removing stale session data.
#[tauri::command]
pub fn cleanup_old_sessions(max_age_days: u64) -> Result<String, String> {
    || -> FontResult<String> {
        SessionManager::global().cleanup_old_sessions(max_age_days)?;
        Ok(format!("Successfully cleaned up sessions older than {} days", max_age_days))
    }()
    .map_err(|e| format!("Failed to clean up old sessions: {}", e))
}

/// Get all font configurations in the current session
/// 
/// Returns a list of FontConfig objects that exist in the current session.
/// This avoids multiple find operations by returning all configs directly.
#[tauri::command]
pub fn get_session_fonts() -> Result<String, String> {
    || -> FontResult<String> {
        let configs = SessionManager::global().load_all_font_configs()?;
        serde_json::to_string(&configs)
            .map_err(|e| crate::error::FontError::Io(std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                format!("Failed to serialize font configs: {}", e)
            )))
    }()
    .map_err(|e| format!("Failed to get session fonts: {}", e))
}

/// Create a new session with preview text
#[tauri::command]
pub fn create_new_session_with_text(preview_text: String) -> Result<String, String> {
    || -> FontResult<String> {
        SessionManager::create_new_session_with_text(preview_text)
    }()
    .map_err(|e| format!("Failed to create new session with text: {}", e))
}

/// Get available sessions (up to 30 most recent)
#[tauri::command]
pub fn get_available_sessions() -> Result<String, String> {
    || -> FontResult<String> {
        let sessions = SessionManager::get_available_sessions(Some(30))?;
        serde_json::to_string(&sessions)
            .map_err(|e| crate::error::FontError::Io(std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                format!("Failed to serialize sessions: {}", e)
            )))
    }()
    .map_err(|e| format!("Failed to get available sessions: {}", e))
}


/// Get the latest session ID (most recent)
#[tauri::command]
pub fn get_latest_session_id() -> Result<Option<String>, String> {
    SessionManager::get_latest_session_id()
        .map_err(|e| format!("Failed to get latest session ID: {}", e))
}

/// Get current session information
#[tauri::command]
pub fn get_current_session_info() -> Result<Option<String>, String> {
    || -> FontResult<Option<String>> {
        let session_manager = SessionManager::global();
        if let Some(session_info) = session_manager.get_current_session_info()? {
            let json = serde_json::to_string(&session_info)
                .map_err(|e| crate::error::FontError::Io(std::io::Error::new(
                    std::io::ErrorKind::InvalidData,
                    format!("Failed to serialize session info: {}", e)
                )))?;
            Ok(Some(json))
        } else {
            Ok(None)
        }
    }()
    .map_err(|e| format!("Failed to get current session info: {}", e))
}