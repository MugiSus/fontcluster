use crate::core::AppState;
use crate::error::Result;
use tauri::{command, State};
use crate::config::{SessionConfig, AlgorithmConfig};
use std::fs;
use chrono::{DateTime, Utc};
use std::path::PathBuf;

#[command]
pub async fn create_new_session(text: String, weights: Vec<i32>, algorithm: Option<AlgorithmConfig>, state: State<'_, AppState>) -> Result<String> {
    state.initialize_session(text, weights, algorithm)
}

#[command]
#[allow(non_snake_case)]
pub async fn get_session_info(sessionId: Option<String>, state: State<'_, AppState>) -> Result<String> {
    if let Some(id) = sessionId {
        state.load_session(&id)?;
    }
    let guard = state.current_session.lock().unwrap();
    let session = guard.as_ref().ok_or_else(|| crate::error::AppError::Processing("No session".into()))?;
    Ok(serde_json::to_string(session)?)
}

#[command]
pub async fn get_available_sessions() -> Result<String> {
    let base = AppState::get_base_dir()?.join("Generated");
    if !base.exists() { return Ok("[]".into()); }
    
    let mut sessions = Vec::new();
    for entry in fs::read_dir(base)? {
        let path = entry?.path();
        if path.is_dir() {
            let config_path = path.join("config.json");
            if config_path.exists() {
                if let Ok(s) = serde_json::from_str::<SessionConfig>(&fs::read_to_string(config_path)?) {
                    sessions.push(s);
                }
            }
        }
    }
    sessions.sort_by(|a, b| b.modified_at.cmp(&a.modified_at));
    Ok(serde_json::to_string(&sessions)?)
}

#[command]
pub async fn get_latest_session_id(app: tauri::AppHandle) -> Result<Option<String>> {
    let base = AppState::get_base_dir()?.join("Generated");
    
    let mut latest: Option<(DateTime<Utc>, String)> = None;
    if base.exists() {
        if let Ok(entries) = fs::read_dir(&base) {
            for entry in entries.filter_map(|e| e.ok()) {
                let path = entry.path();
                if path.is_dir() {
                    let config_path = path.join("config.json");
                    if let Ok(content) = fs::read_to_string(&config_path) {
                        if let Ok(s) = serde_json::from_str::<SessionConfig>(&content) {
                            let current_time = s.modified_at;
                            if latest.is_none() || current_time > latest.as_ref().unwrap().0 {
                                latest = Some((current_time, s.id));
                            }
                        }
                    }
                }
            }
        }
    }

    if latest.is_none() {
        println!("✨ No existing sessions found. Attempting to extract example session...");
        return crate::core::extract_example_session(&app);
    }
    
    Ok(latest.map(|(_, id)| id))
}

#[command]
#[allow(non_snake_case)]
pub async fn get_session_directory(sessionId: String) -> Result<PathBuf> {
    AppState::get_base_dir().map(|d| d.join("Generated").join(sessionId))
}

#[command]
#[allow(non_snake_case)]
pub async fn delete_session(sessionUuid: String) -> Result<bool> {
    let path = AppState::get_base_dir()?.join("Generated").join(sessionUuid);
    if path.exists() {
        fs::remove_dir_all(path)?;
        Ok(true)
    } else {
        Ok(false)
    }
}
