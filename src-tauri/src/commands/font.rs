use crate::core::{AppState, session::load_font_metadata};
use crate::error::Result;
use tauri::{command, State};
use std::fs;
use std::path::PathBuf;

#[command]
pub async fn get_compressed_vectors(sessionId: String, _state: State<'_, AppState>) -> Result<String> {
    let session_dir = AppState::get_base_dir()?.join("Generated").join(sessionId);
    let mut map = std::collections::HashMap::new();
    
    if session_dir.exists() {
        for entry in fs::read_dir(session_dir)? {
            let path = entry?.path();
            if path.is_dir() {
                if let Ok(meta) = load_font_metadata(&path.parent().unwrap(), path.file_name().unwrap().to_str().unwrap()) {
                    map.insert(meta.safe_name.clone(), meta);
                }
            }
        }
    }
    Ok(serde_json::to_string(&map)?)
}

#[command]
pub async fn get_system_fonts() -> Result<Vec<String>> {
    let source = font_kit::source::SystemSource::new();
    let families = source.all_families()?;
    let mut fonts: Vec<String> = families.into_iter()
        .filter(|f| !f.to_lowercase().contains("emoji") && !f.to_lowercase().contains("icon"))
        .collect();
    fonts.sort();
    Ok(fonts)
}
