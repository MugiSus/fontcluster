use crate::config::{AlgorithmConfig, ProcessStatus, SessionConfig};
use crate::core::{
    is_session_document_path, read_session_config_from_dir, read_session_config_from_document,
    AppState,
};
use crate::error::Result;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::PathBuf;
use tauri::{command, State};

const SESSION_HISTORY_LIMIT: usize = 20;

enum StoredSessionLocation {
    Document(PathBuf),
    Processing(PathBuf),
}

struct StoredSession {
    session: SessionConfig,
    location: StoredSessionLocation,
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
    let mut sessions: Vec<SessionConfig> = collect_stored_sessions()?
        .into_iter()
        .map(|stored| stored.session)
        .collect();
    sessions.sort_by(|a, b| b.modified_at.cmp(&a.modified_at));
    Ok(serde_json::to_string(&sessions)?)
}

#[command]
pub async fn get_session_history(state: State<'_, AppState>) -> Result<Vec<SessionConfig>> {
    let mut sessions = collect_stored_sessions()?;
    sessions.sort_by(|a, b| b.session.modified_at.cmp(&a.session.modified_at));
    prune_session_history(&mut sessions, &state)?;
    Ok(sessions.into_iter().map(|stored| stored.session).collect())
}

fn collect_stored_sessions() -> Result<Vec<StoredSession>> {
    let mut sessions: HashMap<String, StoredSession> = HashMap::new();

    let generated_dir = AppState::get_generated_dir()?;
    if generated_dir.exists() {
        for entry in fs::read_dir(&generated_dir)? {
            let path = entry?.path();
            if !is_session_document_path(&path) {
                continue;
            }
            if let Ok(session) = read_session_config_from_document(&path) {
                sessions.insert(
                    session.session_id.clone(),
                    StoredSession {
                        session,
                        location: StoredSessionLocation::Document(path),
                    },
                );
            }
        }
    }

    let processing_root = AppState::get_session_processing_root()?;
    if processing_root.exists() {
        for entry in fs::read_dir(&processing_root)? {
            let path = entry?.path();
            if !path.is_dir() {
                continue;
            }
            let is_hidden = path
                .file_name()
                .and_then(|name| name.to_str())
                .is_some_and(|name| name.starts_with('.'));
            if is_hidden {
                continue;
            }
            if let Ok(session) = read_session_config_from_dir(&path) {
                sessions
                    .entry(session.session_id.clone())
                    .or_insert(StoredSession {
                        session,
                        location: StoredSessionLocation::Processing(path),
                    });
            }
        }
    }

    Ok(sessions.into_values().collect())
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

        match &stored.location {
            StoredSessionLocation::Document(path) => fs::remove_file(path)?,
            StoredSessionLocation::Processing(path) => fs::remove_dir_all(path)?,
        }
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
    let sessions = collect_stored_sessions()?;
    let has_sessions = !sessions.is_empty();

    let latest = sessions
        .into_iter()
        .map(|stored| stored.session)
        .filter(|session| session.status.process_status == ProcessStatus::Clustered)
        .max_by_key(|session| session.modified_at)
        .map(|session| session.session_id);

    if latest.is_none() && !has_sessions {
        println!("✨ No existing sessions found. Attempting to extract example session...");
        return crate::core::extract_example_session(&app);
    }

    Ok(latest)
}

#[command]
#[allow(non_snake_case)]
pub async fn get_session_directory(sessionId: String) -> Result<PathBuf> {
    AppState::resolve_session_dir(&sessionId)
}

#[command]
#[allow(non_snake_case)]
pub async fn delete_session(sessionUuid: String) -> Result<bool> {
    let mut deleted = false;
    let document_path = AppState::get_session_document_path(&sessionUuid)?;
    if document_path.exists() {
        fs::remove_file(&document_path)?;
        deleted = true;
    }
    let processing_dir = AppState::get_session_processing_dir(&sessionUuid)?;
    if processing_dir.exists() {
        fs::remove_dir_all(&processing_dir)?;
        deleted = true;
    }
    let current_dir = AppState::get_session_current_dir(&sessionUuid)?;
    if current_dir.exists() {
        fs::remove_dir_all(&current_dir)?;
    }
    Ok(deleted)
}
