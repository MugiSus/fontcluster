use crate::config::{AlgorithmConfig, ProcessStatus, SessionConfig};
use crate::core::{read_session_config_from_document, AppState, SESSION_DOCUMENT_EXTENSION};
use crate::error::Result;
use chrono::{DateTime, Utc};
use std::collections::HashSet;
use std::fs;
use std::path::PathBuf;
use tauri::{command, State};

const SESSION_HISTORY_LIMIT: usize = 20;

struct StoredSession {
    session: SessionConfig,
    path: PathBuf,
}

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
    let base = AppState::get_generated_dir()?;
    if !base.exists() {
        return Ok("[]".into());
    }

    let mut sessions = Vec::new();
    for entry in fs::read_dir(base)? {
        let path = entry?.path();
        if path
            .extension()
            .and_then(|extension| extension.to_str())
            .is_some_and(|extension| extension == SESSION_DOCUMENT_EXTENSION)
        {
            if let Ok(s) = read_session_config_from_document(&path) {
                sessions.push(s);
            }
        }
    }
    sessions.sort_by(|a, b| b.modified_at.cmp(&a.modified_at));
    Ok(serde_json::to_string(&sessions)?)
}

#[command]
pub async fn get_session_history(state: State<'_, AppState>) -> Result<Vec<SessionConfig>> {
    let mut sessions = read_stored_sessions()?;
    prune_session_history(&mut sessions, &state)?;
    Ok(sessions.into_iter().map(|stored| stored.session).collect())
}

fn read_stored_sessions() -> Result<Vec<StoredSession>> {
    let base = AppState::get_generated_dir()?;
    if !base.exists() {
        return Ok(Vec::new());
    }

    let mut sessions = Vec::new();
    for entry in fs::read_dir(base)? {
        let path = entry?.path();
        if !path
            .extension()
            .and_then(|extension| extension.to_str())
            .is_some_and(|extension| extension == SESSION_DOCUMENT_EXTENSION)
        {
            continue;
        }

        if let Ok(session) = read_session_config_from_document(&path) {
            sessions.push(StoredSession { session, path });
        }
    }

    sessions.sort_by(|a, b| b.session.modified_at.cmp(&a.session.modified_at));
    Ok(sessions)
}

fn prune_session_history(sessions: &mut Vec<StoredSession>, state: &AppState) -> Result<()> {
    if sessions.len() <= SESSION_HISTORY_LIMIT {
        return Ok(());
    }

    let current_session_id = state
        .current_session
        .lock()
        .unwrap()
        .as_ref()
        .map(|session| session.session_id.clone());
    let running_session_ids = state
        .current_job_children
        .lock()
        .unwrap()
        .keys()
        .cloned()
        .collect::<HashSet<_>>();

    let mut retained = Vec::with_capacity(SESSION_HISTORY_LIMIT);
    for (index, stored) in std::mem::take(sessions).into_iter().enumerate() {
        let session_id = &stored.session.session_id;
        let is_protected = current_session_id.as_ref() == Some(session_id)
            || running_session_ids.contains(session_id);
        if index < SESSION_HISTORY_LIMIT || is_protected {
            retained.push(stored);
            continue;
        }

        fs::remove_file(&stored.path)?;
    }

    *sessions = retained;
    Ok(())
}

#[command]
pub async fn get_running_session_ids(state: State<'_, AppState>) -> Result<Vec<String>> {
    let running_jobs = state.current_job_children.lock().unwrap();
    Ok(running_jobs.keys().cloned().collect())
}

#[command]
pub async fn get_latest_session_id(app: tauri::AppHandle) -> Result<Option<String>> {
    let base = AppState::get_generated_dir()?;

    let mut latest: Option<(DateTime<Utc>, String)> = None;
    let mut has_sessions = false;
    if base.exists() {
        if let Ok(entries) = fs::read_dir(&base) {
            for entry in entries.filter_map(|e| e.ok()) {
                let path = entry.path();
                if path
                    .extension()
                    .and_then(|extension| extension.to_str())
                    .is_some_and(|extension| extension == SESSION_DOCUMENT_EXTENSION)
                {
                    if let Ok(s) = read_session_config_from_document(&path) {
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

    if latest.is_none() && !has_sessions {
        println!("✨ No existing sessions found. Attempting to extract example session...");
        return crate::core::extract_example_session(&app);
    }

    Ok(latest.map(|(_, id)| id))
}

#[command]
#[allow(non_snake_case)]
pub async fn get_session_directory(sessionId: String) -> Result<PathBuf> {
    let path = AppState::get_session_cache_dir(&sessionId)?;
    if path.exists() {
        Ok(path)
    } else {
        AppState::prepare_session_cache(&sessionId)
    }
}

#[command]
#[allow(non_snake_case)]
pub async fn delete_session(sessionUuid: String) -> Result<bool> {
    let path = AppState::get_session_document_path(&sessionUuid)?;
    let cache_path = AppState::get_session_cache_dir(&sessionUuid)?;
    if path.exists() {
        fs::remove_file(path)?;
        if cache_path.exists() {
            fs::remove_dir_all(cache_path)?;
        }
        Ok(true)
    } else {
        Ok(false)
    }
}
