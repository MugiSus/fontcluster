use crate::config::{AlgorithmConfig, ProcessStatus, SessionConfig};
use crate::core::AppState;
use crate::error::Result;
use chrono::{DateTime, Utc};
use std::fs;
use std::path::PathBuf;
use tauri::{command, State};

#[command]
pub async fn create_new_session(
    text: String,
    weights: Vec<i32>,
    algorithm: Option<AlgorithmConfig>,
    state: State<'_, AppState>,
) -> Result<String> {
    state.initialize_session(text, weights, algorithm)
}

#[command]
#[allow(non_snake_case)]
pub async fn get_session_info(
    sessionId: Option<String>,
    state: State<'_, AppState>,
) -> Result<String> {
    if let Some(id) = sessionId {
        state.load_session(&id)?;
    }
    let guard = state.current_session.lock().unwrap();
    let session = guard
        .as_ref()
        .ok_or_else(|| crate::error::AppError::Processing("No session".into()))?;
    Ok(serde_json::to_string(session)?)
}

#[command]
pub async fn get_available_sessions() -> Result<String> {
    let base = AppState::get_base_dir()?.join("Generated");
    if !base.exists() {
        return Ok("[]".into());
    }

    let mut sessions = Vec::new();
    for entry in fs::read_dir(base)? {
        let path = entry?.path();
        if path.is_dir() {
            let config_path = path.join("config.json");
            if config_path.exists() {
                if let Ok(s) =
                    serde_json::from_str::<SessionConfig>(&fs::read_to_string(config_path)?)
                {
                    sessions.push(s);
                }
            }
        }
    }
    sessions.sort_by(|a, b| b.modified_at.cmp(&a.modified_at));
    Ok(serde_json::to_string(&sessions)?)
}

#[command]
pub async fn get_session_history() -> Result<Vec<SessionConfig>> {
    let base = AppState::get_base_dir()?.join("Generated");
    if !base.exists() {
        return Ok(Vec::new());
    }

    let mut sessions = Vec::new();
    for entry in fs::read_dir(base)? {
        let path = entry?.path();
        if !path.is_dir() {
            continue;
        }

        let config_path = path.join("config.json");
        if !config_path.exists() {
            continue;
        }

        if let Ok(session) =
            serde_json::from_str::<SessionConfig>(&fs::read_to_string(config_path)?)
        {
            sessions.push(session);
        }
    }

    sessions.sort_by(|a, b| b.modified_at.cmp(&a.modified_at));
    Ok(sessions)
}

#[command]
pub async fn get_running_session_ids(state: State<'_, AppState>) -> Result<Vec<String>> {
    let running_jobs = state.current_job_children.lock().unwrap();
    Ok(running_jobs.keys().cloned().collect())
}

#[command]
pub async fn get_latest_session_id(app: tauri::AppHandle) -> Result<Option<String>> {
    let base = AppState::get_base_dir()?.join("Generated");

    let mut latest: Option<(DateTime<Utc>, String)> = None;
    let mut has_sessions = false;
    if base.exists() {
        if let Ok(entries) = fs::read_dir(&base) {
            for entry in entries.filter_map(|e| e.ok()) {
                let path = entry.path();
                if path.is_dir() {
                    let config_path = path.join("config.json");
                    if let Ok(content) = fs::read_to_string(&config_path) {
                        if let Ok(s) = serde_json::from_str::<SessionConfig>(&content) {
                            has_sessions = true;
                            if s.status.process_status != ProcessStatus::Clustered {
                                continue;
                            }

                            let current_time = s.modified_at;
                            if latest.is_none() || current_time > latest.as_ref().unwrap().0 {
                                latest = Some((current_time, s.session_id));
                            }
                        }
                    }
                }
            }
        }
    }

    if latest.is_none() && !has_sessions {
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
    let path = AppState::get_base_dir()?
        .join("Generated")
        .join(sessionUuid);
    if path.exists() {
        fs::remove_dir_all(path)?;
        Ok(true)
    } else {
        Ok(false)
    }
}
