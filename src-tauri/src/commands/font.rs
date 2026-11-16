//! Commands backing the font browser and on-demand preview rendering.
//!
//! Besides listing a session's fonts and the installed system families, this
//! renders sample preview PNGs for a selected font on demand. Previews are cached
//! on disk (LRU) keyed by a hash of every input that affects the output, and
//! system fonts are resolved through a lazily-built index so repeated previews
//! don't re-scan the font database.

use crate::config::{FontData, FontMetadata, FontSource, RenderConfig};
use crate::core::google_fonts_downloader::download_google_font_subset_temp;
use crate::core::{session::load_font_data, AppState};
use crate::error::{AppError, Result};
use crate::rendering::FontRenderer;
use rayon::prelude::*;
use ritecache::{DiskCacheError, LruDiskCache};
use serde::{Deserialize, Serialize};
use std::collections::hash_map::DefaultHasher;
use std::collections::HashMap;
use std::fs;
use std::hash::{Hash, Hasher};
use std::io::Read;
use std::path::PathBuf;
use std::sync::Arc;
use std::sync::Mutex;
use swash::FontRef;
use tauri::{command, State};
use tauri::{AppHandle, Manager};

/// Maximum combined size of preview PNGs and Google font subsets (500 MiB).
const PREVIEW_CACHE_SIZE_LIMIT: u64 = 500 * 1024 * 1024;

/// Tauri-managed state for preview rendering.
///
/// Both members are lazily initialised on first use and shared across preview
/// requests: the LRU disk cache of PNGs/font subsets and the system-font index.
#[derive(Default)]
pub struct FontPreviewCacheState {
    cache: Mutex<Option<LruDiskCache>>,
    system_fonts: Mutex<Option<SystemFontResolver>>,
}

/// Arguments for [`render_font_preview`].
#[derive(Debug, Deserialize)]
pub struct RenderFontPreviewPayload {
    font: FontMetadata,
    candidates: Vec<Vec<String>>,
    font_size: f32,
}

#[derive(Serialize)]
pub struct FontPreviewLine {
    text: String,
    path: String,
}

/// One indexed system font face: where to find it plus the fields used to
/// match it against a [`FontMetadata`].
struct SystemFontFace {
    path: PathBuf,
    font_index: u32,
    weight: i32,
    families: Vec<String>,
}

/// In-memory index of installed system fonts for fast resolution.
///
/// `by_postscript_name` gives an exact lookup; `faces` backs the fuzzy
/// family-and-weight fallback when the PostScript name is unknown.
struct SystemFontResolver {
    faces: Vec<SystemFontFace>,
    by_postscript_name: HashMap<String, (PathBuf, u32)>,
}

impl SystemFontResolver {
    /// Builds the index by scanning the system font database once.
    fn new() -> Self {
        let mut db = fontdb::Database::new();
        db.load_system_fonts();

        let mut faces = Vec::new();
        let mut by_postscript_name = HashMap::new();
        for face in db.faces() {
            let path = match &face.source {
                fontdb::Source::File(path) => path,
                fontdb::Source::SharedFile(path, _) => path,
                fontdb::Source::Binary(_) => continue,
            };
            let path = path.to_path_buf();
            by_postscript_name.insert(face.post_script_name.clone(), (path.clone(), face.index));
            faces.push(SystemFontFace {
                path,
                font_index: face.index,
                weight: face.weight.0 as i32,
                families: face
                    .families
                    .iter()
                    .map(|(family, _)| family.clone())
                    .collect(),
            });
        }

        Self {
            faces,
            by_postscript_name,
        }
    }

    /// Resolves a font to a `(path, face index)`, matching on PostScript name
    /// first and falling back to a family-name + nearby-weight search.
    fn resolve(&self, font: &FontMetadata) -> Result<(PathBuf, u32)> {
        if let Some((path, font_index)) = font
            .postscript_name
            .as_ref()
            .and_then(|postscript_name| self.by_postscript_name.get(postscript_name))
        {
            return Ok((path.clone(), *font_index));
        }

        let face = self
            .faces
            .iter()
            .find(|face| {
                (face.weight - font.weight).abs() <= 50
                    && face.families.iter().any(|family| {
                        family == &font.family_name
                            || font.family_names.values().any(|name| name == family)
                            || font
                                .preferred_family_names
                                .values()
                                .any(|name| name == family)
                    })
            })
            .ok_or_else(|| {
                AppError::Processing(format!("Failed to resolve system font {}", font.font_name))
            })?;

        Ok((face.path.clone(), face.font_index))
    }
}

/// Resolves a system font, building the [`SystemFontResolver`] index on first
/// use and reusing it thereafter.
fn resolve_system_font(
    preview_cache_state: &FontPreviewCacheState,
    font: &FontMetadata,
) -> Result<(PathBuf, u32)> {
    let mut resolver = preview_cache_state
        .system_fonts
        .lock()
        .map_err(|_| AppError::Processing("System font resolver lock poisoned".into()))?;
    if resolver.is_none() {
        *resolver = Some(SystemFontResolver::new());
    }
    resolver.as_ref().unwrap().resolve(font)
}

/// Reads every font in a session as a `safe_name -> FontData` map.
///
/// Shared by [`crate::commands::load_session`] rather than exposed as its own
/// command.
pub fn read_font_items(session_id: &str) -> Result<HashMap<String, FontData>> {
    let session_dir = AppState::resolve_session_dir(session_id)?;
    let samples_dir = session_dir.join("samples");
    let mut map = HashMap::new();

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
    Ok(map)
}

/// Renders the first fully supported candidate, preserving its line order.
/// The caller owns the sample text and candidate priority.
///
/// The actual work runs on a blocking thread; see
/// [`render_font_preview_blocking`].
#[command]
pub async fn render_font_preview(
    app: AppHandle,
    _state: State<'_, AppState>,
    preview_cache_state: State<'_, Arc<FontPreviewCacheState>>,
    payload: RenderFontPreviewPayload,
) -> Result<Vec<FontPreviewLine>> {
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

/// Loads a face once for both coverage checks and rendering. Google subsets
/// contain the union of candidate characters and share the existing bounded
/// disk cache with PNGs; no selection/coverage state is stored separately.
fn load_preview_font(
    preview_cache_state: &FontPreviewCacheState,
    font: &FontMetadata,
    candidates: &[Vec<String>],
) -> Result<(Vec<u8>, u32)> {
    if font.source == FontSource::System {
        let (path, index) = resolve_system_font(preview_cache_state, font)?;
        return Ok((fs::read(path)?, index));
    }

    let mut characters: Vec<char> = candidates
        .iter()
        .flatten()
        .flat_map(|s| s.chars())
        .collect();
    characters.sort_unstable();
    characters.dedup();
    let text: String = characters.into_iter().collect();
    let mut hasher = DefaultHasher::new();
    font.family_name.hash(&mut hasher);
    font.weight.hash(&mut hasher);
    text.hash(&mut hasher);
    let key = format!("subset-{:016x}.font", hasher.finish());
    let cached = preview_cache_state
        .cache
        .lock()
        .map_err(|_| AppError::Processing("Font preview cache lock poisoned".into()))?
        .as_mut()
        .ok_or_else(|| AppError::Processing("Font preview cache is not initialized".into()))?
        .get_file(&key);
    match cached {
        Ok(mut file) => {
            let mut bytes = Vec::new();
            file.read_to_end(&mut bytes)?;
            Ok((bytes, 0))
        }
        Err(DiskCacheError::FileNotInCache) => {
            let file = download_google_font_subset_temp(&font.family_name, font.weight, &text)?;
            let bytes = fs::read(file.path())?;
            preview_cache_state
                .cache
                .lock()
                .map_err(|_| AppError::Processing("Font preview cache lock poisoned".into()))?
                .as_mut()
                .ok_or_else(|| {
                    AppError::Processing("Font preview cache is not initialized".into())
                })?
                .insert_file(&key, file.path())
                .map_err(|error| AppError::Io(error.to_string()))?;
            Ok((bytes, 0))
        }
        Err(error) => Err(AppError::Io(error.to_string())),
    }
}

/// Selects from cmap before any rasterisation, then renders/caches each line.
/// Image keys include the actual source bytes and face index so cached images
/// cannot outlive a change in the font used for the coverage check.
fn render_font_preview_blocking(
    cache_dir: PathBuf,
    preview_cache_state: &FontPreviewCacheState,
    payload: RenderFontPreviewPayload,
) -> Result<Vec<FontPreviewLine>> {
    if payload.candidates.is_empty()
        || payload
            .candidates
            .iter()
            .any(|lines| lines.is_empty() || lines.iter().any(String::is_empty))
    {
        return Err(AppError::Font(
            "Preview candidates and lines must not be empty".into(),
        ));
    }
    {
        let mut cache = preview_cache_state
            .cache
            .lock()
            .map_err(|_| AppError::Processing("Font preview cache lock poisoned".into()))?;
        if cache.is_none() {
            *cache = Some(
                LruDiskCache::new(&cache_dir, PREVIEW_CACHE_SIZE_LIMIT)
                    .map_err(|error| AppError::Io(error.to_string()))?,
            );
        }
    }
    let (font_data, font_index) =
        load_preview_font(preview_cache_state, &payload.font, &payload.candidates)?;
    let font = FontRef::from_index(&font_data, font_index as usize)
        .ok_or_else(|| AppError::Font(format!("Failed to parse font face {font_index}")))?;
    let charmap = font.charmap();
    let lines = payload
        .candidates
        .iter()
        .find(|lines| {
            lines
                .iter()
                .flat_map(|line| line.chars())
                .all(|ch| charmap.map(ch) != 0)
        })
        .ok_or_else(|| {
            AppError::Font("No preview candidate is fully supported by this font".into())
        })?;

    let mut hasher = DefaultHasher::new();
    font_data.hash(&mut hasher);
    font_index.hash(&mut hasher);
    payload.font_size.to_bits().hash(&mut hasher);
    let source_hash = hasher.finish();

    lines
        .par_iter()
        .map(|text| {
            let mut hasher = DefaultHasher::new();
            source_hash.hash(&mut hasher);
            text.hash(&mut hasher);
            let key = format!("preview-{:016x}.png", hasher.finish());
            let (cache_root, cached) = {
                let mut cache = preview_cache_state
                    .cache
                    .lock()
                    .map_err(|_| AppError::Processing("Font preview cache lock poisoned".into()))?;
                let cache = cache.as_mut().ok_or_else(|| {
                    AppError::Processing("Font preview cache is not initialized".into())
                })?;
                (cache.path().to_path_buf(), cache.get_file(&key))
            };
            match cached {
                Ok(_) => {}
                Err(DiskCacheError::FileNotInCache) => {
                    let output = tempfile::NamedTempFile::new()?;
                    let renderer = FontRenderer::new(Arc::new(RenderConfig {
                        text: text.clone(),
                        font_size: payload.font_size,
                        output_dir: cache_root.clone(),
                    }));
                    renderer.render_data_to_path(&font_data, font_index, output.path())?;
                    preview_cache_state
                        .cache
                        .lock()
                        .map_err(|_| {
                            AppError::Processing("Font preview cache lock poisoned".into())
                        })?
                        .as_mut()
                        .ok_or_else(|| {
                            AppError::Processing("Font preview cache is not initialized".into())
                        })?
                        .insert_file(&key, output.path())
                        .map_err(|error| AppError::Io(error.to_string()))?;
                }
                Err(error) => return Err(AppError::Io(error.to_string())),
            }
            Ok(FontPreviewLine {
                text: text.clone(),
                path: cache_root.join(key).to_string_lossy().into_owned(),
            })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn preview_selects_complete_candidates_in_order_and_reuses_sources() {
        let dir = tempfile::tempdir().unwrap();
        let font_path = dir.path().join("fixture.ttf");
        let bytes = include_bytes!("../../tests/fixtures/preview.ttf");
        fs::write(&font_path, bytes).unwrap();
        let state = FontPreviewCacheState {
            system_fonts: Mutex::new(Some(SystemFontResolver {
                faces: Vec::new(),
                by_postscript_name: HashMap::from([(
                    "PreviewFixture".into(),
                    (font_path.clone(), 0),
                )]),
            })),
            ..Default::default()
        };
        let font: FontMetadata = serde_json::from_value(serde_json::json!({
            "source": "system", "safe_name": "fixture", "font_name": "Preview Fixture",
            "family_name": "Preview Fixture", "family_names": {}, "preferred_family_names": {},
            "style_name": "Regular", "style_names": {}, "preferred_style_names": {},
            "publishers": {}, "designers": {}, "postscript_name": "PreviewFixture",
            "weight": 400, "weights": [], "font_index": 0
        }))
        .unwrap();
        let cache_dir = dir.path().join("cache");
        let render = |font: &FontMetadata, candidates: &[&[&str]]| {
            render_font_preview_blocking(
                cache_dir.clone(),
                &state,
                RenderFontPreviewPayload {
                    font: font.clone(),
                    candidates: candidates
                        .iter()
                        .map(|lines| lines.iter().map(|text| (*text).to_string()).collect())
                        .collect(),
                    font_size: 96.0,
                },
            )
        };
        let kana: &[&str] = &["いろはに", "ホヘトチ", "あなふの", "アタユシ"];
        // A later missing character/line must reject the entire first candidate.
        let fallback = render(&font, &[&["永", "東"], kana]).unwrap();
        assert_eq!(
            fallback
                .iter()
                .map(|line| line.text.as_str())
                .collect::<Vec<_>>(),
            kana
        );
        for line in &fallback {
            let image = image::open(&line.path).unwrap().to_rgba8();
            assert!(image.pixels().any(|pixel| pixel[3] != 0));
        }
        assert_eq!(render(&font, &[&["永"], kana]).unwrap()[0].text, "永");
        assert_eq!(render(&font, &[kana, &["永"]]).unwrap().len(), 4);
        assert!(render(&font, &[&["東"], &["国"]]).is_err());
        assert!(render(&font, &[]).is_err());
        assert!(render(&font, &[&[]]).is_err());
        assert!(render(&font, &[&[""]]).is_err());
        let cached = render(&font, &[kana]).unwrap();
        assert_eq!(cached[0].path, fallback[0].path);

        // Seed a Google subset for a deliberately nonexistent family. Rendering
        // can succeed only by reusing the cached source, without a download.
        let google = FontMetadata {
            source: FontSource::GoogleFonts,
            ..font.clone()
        };
        let mut chars: Vec<char> = "永東いろはにホヘトチあなふのアタユシ".chars().collect();
        chars.sort_unstable();
        chars.dedup();
        let mut hasher = DefaultHasher::new();
        google.family_name.hash(&mut hasher);
        google.weight.hash(&mut hasher);
        chars.into_iter().collect::<String>().hash(&mut hasher);
        state
            .cache
            .lock()
            .unwrap()
            .as_mut()
            .unwrap()
            .insert_file(format!("subset-{:016x}.font", hasher.finish()), &font_path)
            .unwrap();
        let reused = render(&google, &[&["永", "東"], kana]).unwrap();
        assert_eq!(reused[0].path, fallback[0].path);
        // Priority and repeated characters don't change the source subset key.
        assert_eq!(
            render(&google, &[kana, &["東永永"]]).unwrap()[0].text,
            kana[0]
        );
    }
}
