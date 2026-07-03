//! Session-management commands: creating, listing, inspecting and deleting
//! sessions, plus enforcing the recent-history cap.
//!
//! Sessions live either as packed documents or as live processing
//! directories; [`collect_stored_sessions`] unifies both views, de-duplicating
//! by id so an in-progress session shadows its older packed copy.

use crate::config::{DendrogramData, FontData, ProcessStatus, SessionConfig};
use crate::core::{
    is_session_document_path, load_dendrogram, read_session_config_from_dir,
    read_session_config_from_document, AppState,
};
use crate::error::Result;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::PathBuf;
use tauri::{command, State};

/// How many recent sessions to keep; older ones are pruned on history fetch.
const SESSION_HISTORY_LIMIT: usize = 20;

/// Where a discovered stored session physically lives, so it can be deleted
/// with the right filesystem call when pruned.
enum StoredSessionLocation {
    Document(PathBuf),
    Processing(PathBuf),
}

/// A stored session's config paired with its on-disk location.
struct StoredSession {
    session: SessionConfig,
    location: StoredSessionLocation,
}

/// Everything the webview needs to display a session in one round-trip.
#[derive(serde::Serialize)]
pub struct SessionPayload {
    config: SessionConfig,
    directory: PathBuf,
    fonts: HashMap<String, FontData>,
    /// Full merge tree of the clustering run; `None` for sessions clustered by
    /// an app version that did not record it.
    dendrogram: Option<DendrogramData>,
}

/// Loads a session by id (making it the active session) and returns its config,
/// on-disk sample directory, font items and dendrogram together.
#[command]
pub async fn load_session(
    session_id: String,
    state: State<'_, AppState>,
) -> Result<SessionPayload> {
    state.load_session(&session_id)?;
    let config = {
        let guard = state.current_session.lock().unwrap();
        guard
            .as_ref()
            .ok_or_else(|| crate::error::AppError::Processing("No session".into()))?
            .clone()
    };
    let directory = AppState::resolve_session_dir(&session_id)?;
    let fonts = crate::commands::font::read_font_items(&session_id)?;
    let dendrogram = load_dendrogram(&directory).ok();
    Ok(SessionPayload {
        config,
        directory,
        fonts,
        dendrogram,
    })
}

/// Returns recent sessions newest first, pruning anything past the history cap
/// as a side effect.
#[command]
pub async fn get_session_history(state: State<'_, AppState>) -> Result<Vec<SessionConfig>> {
    let mut sessions = collect_stored_sessions()?;
    sessions.sort_by(|a, b| b.session.modified_at.cmp(&a.session.modified_at));
    prune_session_history(&mut sessions, &state)?;
    Ok(sessions.into_iter().map(|stored| stored.session).collect())
}

/// Gathers sessions from both stored documents and processing directories,
/// keyed by id so a live processing copy shadows the packed one.
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
                sessions.insert(
                    session.session_id.clone(),
                    StoredSession {
                        session,
                        location: StoredSessionLocation::Processing(path),
                    },
                );
            }
        }
    }

    Ok(sessions.into_values().collect())
}

/// Deletes sessions beyond [`SESSION_HISTORY_LIMIT`] from disk and from
/// `sessions`, expecting the slice to be sorted newest-first.
///
/// The active session and any with a running job are always kept, even if they
/// fall outside the limit.
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

/// Returns the ids of sessions that currently have a running job.
#[command]
pub async fn get_running_session_ids(state: State<'_, AppState>) -> Result<Vec<String>> {
    let running_jobs = state.current_job_children.lock().unwrap();
    Ok(running_jobs.keys().cloned().collect())
}

/// Returns the most recently modified completed (`Clustered`) session.
///
/// When there are no sessions at all, seeds the bundled example session and
/// returns its id instead.
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

/// Deletes a session's document and working/view directories.
///
/// Returns `true` if a document or processing directory was removed (i.e. the
/// session actually existed).
#[command]
pub async fn delete_session(session_id: String) -> Result<bool> {
    let mut deleted = false;
    let document_path = AppState::get_session_document_path(&session_id)?;
    if document_path.exists() {
        fs::remove_file(&document_path)?;
        deleted = true;
    }
    let processing_dir = AppState::get_session_processing_dir(&session_id)?;
    if processing_dir.exists() {
        fs::remove_dir_all(&processing_dir)?;
        deleted = true;
    }
    let current_dir = AppState::get_session_current_dir(&session_id)?;
    if current_dir.exists() {
        fs::remove_dir_all(&current_dir)?;
    }
    Ok(deleted)
}
