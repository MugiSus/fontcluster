use crate::config::{FontMetadata, FontSource, RenderConfig};
use crate::core::google_fonts_downloader::download_google_font_subset_temp;
use crate::core::{session::load_font_data, AppState};
use crate::error::{AppError, Result};
use crate::rendering::FontRenderer;
use ritecache::{DiskCacheError, LruDiskCache};
use serde::Deserialize;
use std::collections::hash_map::DefaultHasher;
use std::fs;
use std::hash::{Hash, Hasher};
use std::path::PathBuf;
use std::sync::Arc;
use std::sync::Mutex;
use std::time::UNIX_EPOCH;
use tauri::{command, State};
use tauri::{AppHandle, Manager};

const PREVIEW_CACHE_SIZE_LIMIT: u64 = 500 * 1024 * 1024;

#[derive(Default)]
pub struct FontPreviewCacheState {
    cache: Mutex<Option<LruDiskCache>>,
}

#[derive(Debug, Deserialize)]
pub struct RenderFontPreviewPayload {
    font: FontMetadata,
    text: String,
    font_size: f32,
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
    preview_cache_state: State<'_, Arc<FontPreviewCacheState>>,
    payload: RenderFontPreviewPayload,
) -> Result<String> {
    let cache_dir = app
        .path()
        .app_cache_dir()
        .map_err(|e| AppError::Io(format!("Failed to resolve app cache dir: {e}")))?
        .join("font-previews");

    let preview_cache_state = Arc::clone(preview_cache_state.inner());
    tokio::task::spawn_blocking(move || {
        render_font_preview_blocking(cache_dir, &preview_cache_state, payload)
    })
    .await
    .map_err(|e| AppError::Processing(e.to_string()))?
}

fn render_font_preview_blocking(
    cache_dir: PathBuf,
    preview_cache_state: &FontPreviewCacheState,
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

    let output_key = format!("{}_{cache_key:016x}.png", payload.font.safe_name);

    let (cache_root, output_path) = {
        let mut preview_cache = preview_cache_state
            .cache
            .lock()
            .map_err(|_| AppError::Processing("Font preview cache lock poisoned".into()))?;
        if preview_cache.is_none() {
            *preview_cache = Some(
                LruDiskCache::new(cache_dir, PREVIEW_CACHE_SIZE_LIMIT)
                    .map_err(|error| AppError::Io(error.to_string()))?,
            );
        }
        let preview_cache = preview_cache.as_mut().unwrap();
        let cache_root = preview_cache.path().to_path_buf();
        let output_path = cache_root.join(&output_key);
        match preview_cache.get_file(&output_key) {
            Ok(_) => return Ok(output_path.to_string_lossy().into_owned()),
            Err(DiskCacheError::FileNotInCache) => {}
            Err(error) => return Err(AppError::Io(error.to_string())),
        }
        (cache_root, output_path)
    };

    let temporary_output =
        tempfile::NamedTempFile::new().map_err(|error| AppError::Io(error.to_string()))?;
    let renderer = FontRenderer::new(Arc::new(RenderConfig {
        text: text.clone(),
        font_size,
        output_dir: cache_root,
    }));
    match renderer.render_to_path(&font_path, payload.font.font_index, temporary_output.path()) {
        Ok(()) => {}
        Err(AppError::MissingGlyph(_)) if payload.font.source == FontSource::GoogleFonts => {
            let font = download_google_font_subset_temp(
                &payload.font.family_name,
                payload.font.weight,
                &text,
            )?;
            renderer.render_to_path(font.path(), 0, temporary_output.path())?;
        }
        Err(error) => return Err(error),
    }

    let mut preview_cache = preview_cache_state
        .cache
        .lock()
        .map_err(|_| AppError::Processing("Font preview cache lock poisoned".into()))?;
    preview_cache
        .as_mut()
        .ok_or_else(|| AppError::Processing("Font preview cache is not initialized".into()))?
        .insert_file(&output_key, temporary_output.path().as_os_str())
        .map_err(|error| AppError::Io(error.to_string()))?;

    Ok(output_path.to_string_lossy().into_owned())
}
