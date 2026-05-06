use crate::config::SessionConfig;
use crate::core::AppState;
use crate::error::Result;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::AppHandle;
use tauri::Manager;

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

    let dest_dir = AppState::get_base_dir()?.join("Generated");
    fs::create_dir_all(&dest_dir).map_err(|e| {
        crate::error::AppError::Io(format!("Failed to create Generated dir: {}", e))
    })?;

    let mut zip_paths = fs::read_dir(&resource_dir)
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
                    .is_some_and(|ext| ext.eq_ignore_ascii_case("zip"))
        })
        .collect::<Vec<_>>();
    zip_paths.sort();

    if zip_paths.is_empty() {
        println!(
            "⚠️ No example zip files found at: {}",
            resource_dir.display()
        );
        return Ok(None);
    }

    let mut restored_sessions = Vec::new();
    for zip_path in zip_paths {
        if let Some(session) = restore_session_from_zip(&zip_path, &dest_dir)? {
            restored_sessions.push(session);
        }
    }

    restored_sessions.sort_by(|a, b| b.modified_at.cmp(&a.modified_at));
    Ok(restored_sessions
        .into_iter()
        .next()
        .map(|session| session.session_id))
}

pub fn restore_session_from_zip(zip_path: &Path, dest_dir: &Path) -> Result<Option<SessionConfig>> {
    println!(
        "📦 Extracting example session from {}...",
        zip_path.display()
    );

    let file = fs::File::open(zip_path)
        .map_err(|e| crate::error::AppError::Io(format!("Failed to open zip: {}", e)))?;
    let mut archive = zip::ZipArchive::new(file)
        .map_err(|e| crate::error::AppError::Processing(format!("Invalid zip: {}", e)))?;

    let mut config_paths = Vec::<PathBuf>::new();
    for i in 0..archive.len() {
        let mut file = archive.by_index(i).map_err(|e| {
            crate::error::AppError::Processing(format!("Failed to read zip index {}: {}", i, e))
        })?;
        let enclosed_path = match file.enclosed_name() {
            Some(path) => path.to_owned(),
            None => continue,
        };

        if should_skip_zip_entry(&enclosed_path) {
            continue;
        }

        let outpath = dest_dir.join(&enclosed_path);
        if file.name().ends_with('/') {
            fs::create_dir_all(&outpath).map_err(|e| {
                crate::error::AppError::Io(format!(
                    "Failed to create dir {}: {}",
                    outpath.display(),
                    e
                ))
            })?;
        } else {
            if let Some(p) = outpath.parent() {
                if !p.exists() {
                    fs::create_dir_all(p).map_err(|e| {
                        crate::error::AppError::Io(format!(
                            "Failed to create parent dir {}: {}",
                            p.display(),
                            e
                        ))
                    })?;
                }
            }
            let mut outfile = fs::File::create(&outpath).map_err(|e| {
                crate::error::AppError::Io(format!(
                    "Failed to create file {}: {}",
                    outpath.display(),
                    e
                ))
            })?;
            std::io::copy(&mut file, &mut outfile).map_err(|e| {
                crate::error::AppError::Io(format!("Failed to copy file contents: {}", e))
            })?;

            if outpath
                .file_name()
                .and_then(|name| name.to_str())
                .is_some_and(|name| name == "config.json")
            {
                config_paths.push(outpath);
            }
        }
    }

    let session = find_restored_session_config(&config_paths)?;
    if let Some(session) = &session {
        println!(
            "✅ Example session extracted successfully: {}",
            session.session_id
        );
    } else {
        println!(
            "⚠️ Example zip did not contain a restorable config.json: {}",
            zip_path.display()
        );
    }
    Ok(session)
}

fn should_skip_zip_entry(path: &Path) -> bool {
    path.components().any(|component| {
        let name = component.as_os_str().to_string_lossy();
        name == "__MACOSX" || name == ".DS_Store" || name.starts_with("._")
    })
}

fn find_restored_session_config(config_paths: &[PathBuf]) -> Result<Option<SessionConfig>> {
    for path in config_paths {
        let content = fs::read_to_string(path).map_err(|e| {
            crate::error::AppError::Io(format!(
                "Failed to read restored config {}: {}",
                path.display(),
                e
            ))
        })?;
        if let Ok(session) = serde_json::from_str::<SessionConfig>(&content) {
            return Ok(Some(session));
        }
    }

    Ok(None)
}
