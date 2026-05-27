use crate::core::{session::load_font_data, AppState};
use crate::error::Result;
use std::fs;
use tauri::{command, State};

#[command]
#[allow(non_snake_case)]
pub async fn get_font_items(sessionId: String, _state: State<'_, AppState>) -> Result<String> {
    let session_dir = AppState::get_base_dir()?.join("Generated").join(sessionId);
    let samples_dir = session_dir.join("samples");
    let mut map = std::collections::HashMap::new();

    if samples_dir.exists() {
        for entry in fs::read_dir(samples_dir)? {
            let path = entry?.path();
            if path.is_dir() {
                if let Ok(font_data) =
                    load_font_data(&session_dir, path.file_name().unwrap().to_str().unwrap())
                {
                    map.insert(font_data.meta.safe_name.clone(), font_data);
                }
            }
        }
    }
    Ok(serde_json::to_string(&map)?)
}

#[command]
pub async fn get_system_fonts() -> Result<Vec<String>> {
    let mut db = fontdb::Database::new();
    db.load_system_fonts();
    let mut fonts: Vec<String> = db
        .faces()
        .flat_map(|face| face.families.iter().map(|(family, _)| family.clone()))
        .filter(|family| {
            let family = family.to_lowercase();
            !family.contains("emoji") && !family.contains("icon")
        })
        .collect();
    fonts.sort();
    fonts.dedup();
    Ok(fonts)
}
