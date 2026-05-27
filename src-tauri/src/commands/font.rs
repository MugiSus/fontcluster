use crate::config::{FontMetadata, RenderConfig};
use crate::core::{session::load_font_data, AppState};
use crate::error::{AppError, Result};
use crate::rendering::FontRenderer;
use serde::Deserialize;
use std::collections::hash_map::DefaultHasher;
use std::fs;
use std::hash::{Hash, Hasher};
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{command, State};
use tauri::{AppHandle, Manager};

const PREVIEW_CACHE_TTL: Duration = Duration::from_secs(7 * 24 * 60 * 60);

#[derive(Debug, Deserialize)]
pub struct RenderFontPreviewPayload {
    font: FontMetadata,
    text: String,
    font_size: f32,
}

fn prune_old_font_preview_cache(cache_dir: &std::path::Path) {
    let Ok(entries) = fs::read_dir(cache_dir) else {
        return;
    };
    let cutoff = SystemTime::now()
        .checked_sub(PREVIEW_CACHE_TTL)
        .unwrap_or(UNIX_EPOCH);

    for entry in entries.filter_map(|entry| entry.ok()) {
        let path = entry.path();
        if path.extension().and_then(|extension| extension.to_str()) != Some("png") {
            continue;
        }
        let Ok(metadata) = entry.metadata() else {
            continue;
        };
        let Ok(modified) = metadata.modified() else {
            continue;
        };
        if modified < cutoff {
            let _ = fs::remove_file(path);
        }
    }
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
    _state: State<'_, AppState>,
    payload: RenderFontPreviewPayload,
) -> Result<String> {
    let text = if payload.text.is_empty() {
        " ".to_string()
    } else {
        payload.text
    };
    let font_size = payload.font_size;
    let font_path = payload
        .font
        .path
        .ok_or_else(|| AppError::Processing("No path in font metadata".into()))?;
    let font_file_metadata = fs::metadata(&font_path).ok();
    let font_file_len = font_file_metadata
        .as_ref()
        .map(|metadata| metadata.len())
        .unwrap_or_default();
    let font_file_modified = font_file_metadata
        .and_then(|metadata| metadata.modified().ok())
        .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
        .map(|duration| (duration.as_secs(), duration.subsec_nanos()));

    let mut hasher = DefaultHasher::new();
    font_path.hash(&mut hasher);
    payload.font.safe_name.hash(&mut hasher);
    payload.font.font_index.hash(&mut hasher);
    font_size.to_bits().hash(&mut hasher);
    font_file_len.hash(&mut hasher);
    font_file_modified.hash(&mut hasher);
    text.hash(&mut hasher);
    let cache_key = hasher.finish();

    let cache_dir = app
        .path()
        .app_cache_dir()
        .map_err(|e| AppError::Io(format!("Failed to resolve app cache dir: {e}")))?
        .join("font-previews");
    prune_old_font_preview_cache(&cache_dir);
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
