//! First-run seeding of the bundled example session.
//!
//! When no sessions exist yet, the example `.fontclusterdoc` documents shipped
//! in the app's resources are copied into the `Generated` directory so the user
//! sees a populated graph on first launch.

use crate::core::{read_session_config_from_document, AppState, SESSION_DOCUMENT_EXTENSION};
use crate::error::Result;
use std::fs;
use tauri::AppHandle;
use tauri::Manager;

/// Copies the bundled example documents into `Generated`.
///
/// Returns the id of the most recently modified restored session, or `None`
/// if the resource directory is missing or contains no documents.
pub fn extract_example_session(app: &AppHandle) -> Result<Option<String>> {
    let resource_dir = app
        .path()
        .resolve("resources/example", tauri::path::BaseDirectory::Resource)
        .map_err(|e| {
            crate::error::AppError::Io(format!("Failed to resolve example directory: {}", e))
        })?;

    if !resource_dir.exists() {
        println!(
            "⚠️ Example directory not found at: {}",
            resource_dir.display()
        );
        return Ok(None);
    }

    let dest_dir = AppState::get_generated_dir()?;
    fs::create_dir_all(&dest_dir).map_err(|e| {
        crate::error::AppError::Io(format!("Failed to create Generated dir: {}", e))
    })?;

    let mut document_paths = fs::read_dir(&resource_dir)
        .map_err(|e| {
            crate::error::AppError::Io(format!(
                "Failed to read example directory {}: {}",
                resource_dir.display(),
                e
            ))
        })?
        .filter_map(|entry| entry.ok().map(|entry| entry.path()))
        .filter(|path| {
            path.is_file()
                && path
                    .extension()
                    .and_then(|ext| ext.to_str())
                    .is_some_and(|ext| ext.eq_ignore_ascii_case(SESSION_DOCUMENT_EXTENSION))
        })
        .collect::<Vec<_>>();
    document_paths.sort();

    let mut restored_sessions = Vec::new();
    for document_path in document_paths {
        let Some(file_name) = document_path.file_name() else {
            continue;
        };
        let dest_path = dest_dir.join(file_name);
        fs::copy(&document_path, &dest_path).map_err(|e| {
            crate::error::AppError::Io(format!(
                "Failed to copy example session {}: {}",
                document_path.display(),
                e
            ))
        })?;
        if let Ok(session) = read_session_config_from_document(&dest_path) {
            restored_sessions.push(session);
        }
    }

    restored_sessions.sort_by(|a, b| b.modified_at.cmp(&a.modified_at));
    Ok(restored_sessions
        .into_iter()
        .next()
        .map(|session| session.session_id))
}

#[cfg(test)]
mod tests {
    use super::should_skip_zip_entry;
    use std::path::Path;

    #[test]
    fn should_skip_macosx_metadata_paths() {
        assert!(should_skip_zip_entry(Path::new("__MACOSX/font/config.json")));
        assert!(should_skip_zip_entry(Path::new("session/.DS_Store")));
        assert!(should_skip_zip_entry(Path::new("session/._config.json")));
    }

    #[test]
    fn should_not_skip_regular_paths() {
        assert!(!should_skip_zip_entry(Path::new("session/config.json")));
        assert!(!should_skip_zip_entry(Path::new("session/samples/font.png")));
    }
}
