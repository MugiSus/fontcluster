use crate::config::{FontMetadata, RenderConfig, DEFAULT_FONT_SIZE};
use crate::core::{session::load_font_data, AppState};
use crate::error::{AppError, Result};
use crate::rendering::FontRenderer;
use serde::Deserialize;
use std::collections::hash_map::DefaultHasher;
use std::fs;
use std::hash::{Hash, Hasher};
use std::sync::Arc;
use tauri::{command, State};
use tauri::{AppHandle, Manager};

#[derive(Debug, Deserialize)]
pub struct RenderFontPreviewPayload {
    font: FontMetadata,
    text: String,
}

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

#[command]
pub async fn render_font_preview(
    app: AppHandle,
    state: State<'_, AppState>,
    payload: RenderFontPreviewPayload,
) -> Result<String> {
    let text = if payload.text.is_empty() {
        " ".to_string()
    } else {
        payload.text
    };
    let font_path = payload
        .font
        .path
        .ok_or_else(|| AppError::Processing("No path in font metadata".into()))?;
    let font_size = {
        let guard = state.current_session.lock().unwrap();
        guard
            .as_ref()
            .and_then(|session| session.algorithm.as_ref())
            .and_then(|algorithm| algorithm.image.as_ref())
            .map(|image| image.font_size)
            .unwrap_or(DEFAULT_FONT_SIZE)
    };

    let mut hasher = DefaultHasher::new();
    font_path.hash(&mut hasher);
    payload.font.font_index.hash(&mut hasher);
    payload.font.safe_name.hash(&mut hasher);
    text.hash(&mut hasher);
    font_size.to_bits().hash(&mut hasher);
    let cache_key = hasher.finish();

    let cache_dir = app
        .path()
        .app_cache_dir()
        .map_err(|e| AppError::Io(format!("Failed to resolve app cache dir: {e}")))?
        .join("font-previews");
    let output_path = cache_dir.join(format!("{}_{cache_key:016x}.png", payload.font.safe_name));

    if !output_path.exists() {
        let renderer = FontRenderer::new(Arc::new(RenderConfig {
            text,
            font_size,
            output_dir: cache_dir,
        }));
        renderer.render_to_path(&font_path, payload.font.font_index, &output_path)?;
    }

    Ok(output_path.to_string_lossy().into_owned())
}
