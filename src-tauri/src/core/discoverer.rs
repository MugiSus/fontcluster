use crate::config::FontSource;
use crate::core::AppState;
use crate::error::{AppError, Result};
use fontdb::{FaceInfo, Source};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use swash::{FontRef, StringId};

#[derive(Debug, Clone)]
pub struct FontRenderSource {
    pub path: PathBuf,
    pub font_index: u32,
}

pub struct DiscoveryResult {
    pub discovered_fonts: HashMap<i32, Vec<String>>,
    pub render_sources: HashMap<String, FontRenderSource>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ExtractedMeta {
    pub display_name: String,
    pub family_names: HashMap<String, String>,
    pub preferred_family_names: HashMap<String, String>,
    pub style_names: HashMap<String, String>,
    pub preferred_style_names: HashMap<String, String>,
    pub publishers: HashMap<String, String>,
    pub designers: HashMap<String, String>,
    pub copyright: Option<String>,
    pub trademark: Option<String>,
    pub version: Option<String>,
    pub postscript_name: Option<String>,
    pub description: Option<String>,
    pub vendor_url: Option<String>,
    pub designer_url: Option<String>,
    pub sample_text: Option<String>,
    pub actual_weight: i32,
    pub available_weights: Vec<String>,
    pub path: PathBuf,
    pub font_index: u32,
}

pub struct Discoverer {}

impl Discoverer {
    pub fn new() -> Self {
        Self {}
    }

    fn google_font_family_from_path(path: &Path) -> Option<String> {
        let stem = path.file_stem()?.to_str()?;
        let family = stem.split_once("_Weight")?.0;
        Some(family.replace('_', " "))
    }

    fn localized_value(font: &FontRef<'_>, id: StringId) -> Option<String> {
        let strings = font.localized_strings();
        strings
            .find_by_id(id, Some("en-US"))
            .or_else(|| strings.find_by_id(id, Some("en")))
            .or_else(|| strings.find_by_id(id, None))
            .map(|s| s.to_string())
            .filter(|s| !s.is_empty())
    }

    fn localized_map(font: &FontRef<'_>, id: StringId) -> HashMap<String, String> {
        let mut map = HashMap::new();
        for string in font.localized_strings() {
            if string.id() == id && string.is_decodable() {
                let value = string.to_string();
                if !value.is_empty() {
                    let language = string.language();
                    map.insert(
                        if language.is_empty() {
                            "und".to_string()
                        } else {
                            language.to_string()
                        },
                        value,
                    );
                }
            }
        }
        map
    }

    fn source_bytes_and_path(source: &Source) -> Result<(Vec<u8>, PathBuf)> {
        match source {
            Source::File(path) => Ok((fs::read(path)?, path.clone())),
            Source::SharedFile(path, data) => Ok((data.as_ref().as_ref().to_vec(), path.clone())),
            Source::Binary(_) => Err(AppError::Font(
                "Font source has no file path and cannot be rendered later".into(),
            )),
        }
    }

    fn preferred(map: &HashMap<String, String>) -> Option<&String> {
        map.get("en-US")
            .or_else(|| map.get("en"))
            .or_else(|| map.get("1033"))
            .or_else(|| map.values().next())
    }

    fn internal_family_name(meta: &ExtractedMeta) -> String {
        Self::preferred(&meta.preferred_family_names)
            .or_else(|| Self::preferred(&meta.family_names))
            .unwrap_or(&meta.display_name)
            .clone()
    }

    fn internal_style_name(meta: &ExtractedMeta) -> String {
        Self::preferred(&meta.preferred_style_names)
            .or_else(|| Self::preferred(&meta.style_names))
            .cloned()
            .unwrap_or_else(|| "Regular".to_string())
    }

    pub fn analyze_font_data(
        data: &[u8],
        index: u32,
        target_text: &str,
        path: PathBuf,
        face: &FaceInfo,
    ) -> Result<ExtractedMeta> {
        let font = FontRef::from_index(data, index as usize)
            .ok_or_else(|| AppError::Font(format!("Failed to parse font {}", path.display())))?;

        for ch in target_text.chars() {
            let gid = font.charmap().map(ch);
            if gid == 0 && ch != '\0' && ch != '\u{FFFD}' {
                return Err(AppError::Font(format!(
                    "Font fallback detected for character '{}' (missing in cmap)",
                    ch
                )));
            }
        }

        let family_names = Self::localized_map(&font, StringId::Family);
        let preferred_family_names = Self::localized_map(&font, StringId::TypographicFamily);
        let style_names = Self::localized_map(&font, StringId::SubFamily);
        let preferred_style_names = Self::localized_map(&font, StringId::TypographicSubFamily);
        let publishers = Self::localized_map(&font, StringId::Manufacturer);
        let designers = Self::localized_map(&font, StringId::Designer);
        let display_name = Self::localized_value(&font, StringId::Full)
            .or_else(|| Self::localized_value(&font, StringId::CompatibleFull))
            .or_else(|| face.families.first().map(|(name, _)| name.clone()))
            .unwrap_or_else(|| face.post_script_name.clone());

        for value in family_names
            .values()
            .chain(preferred_family_names.values())
            .chain(style_names.values())
            .chain(preferred_style_names.values())
            .chain(std::iter::once(&display_name))
        {
            if value.contains("LastResort") || value.starts_with('.') {
                return Err(AppError::Font(format!(
                    "Skipping system internal font: {}",
                    value
                )));
            }
        }

        Ok(ExtractedMeta {
            display_name,
            family_names,
            preferred_family_names,
            style_names,
            preferred_style_names,
            publishers,
            designers,
            copyright: Self::localized_value(&font, StringId::Copyright),
            trademark: Self::localized_value(&font, StringId::Trademark),
            version: Self::localized_value(&font, StringId::Version),
            postscript_name: Self::localized_value(&font, StringId::PostScript)
                .or_else(|| Some(face.post_script_name.clone())),
            description: Self::localized_value(&font, StringId::Description),
            vendor_url: Self::localized_value(&font, StringId::VendorUrl),
            designer_url: Self::localized_value(&font, StringId::DesignerUrl),
            sample_text: Self::localized_value(&font, StringId::SampleText),
            actual_weight: face.weight.0 as i32,
            available_weights: Vec::new(),
            path,
            font_index: index,
        })
    }

    pub async fn discover_fonts(&self, state: &AppState) -> Result<DiscoveryResult> {
        self.discover_fonts_with_google_fonts_dir(state, None).await
    }

    pub async fn discover_fonts_from_google_fonts_dir(
        &self,
        state: &AppState,
        google_fonts_dir: PathBuf,
    ) -> Result<DiscoveryResult> {
        self.discover_fonts_with_google_fonts_dir(state, Some(google_fonts_dir))
            .await
    }

    async fn discover_fonts_with_google_fonts_dir(
        &self,
        state: &AppState,
        google_fonts_dir: Option<PathBuf>,
    ) -> Result<DiscoveryResult> {
        let (preview_text, target_weights, session_id, font_set) = {
            let guard = state.current_session.lock().unwrap();
            let s = guard.as_ref().unwrap();
            let font_set = s
                .algorithm
                .as_ref()
                .and_then(|a| a.rendering.as_ref())
                .map(|rendering| rendering.font_set.clone())
                .unwrap_or_default();
            (
                s.preview_text.clone(),
                s.weights.clone(),
                s.session_id.clone(),
                font_set,
            )
        };
        let session_dir = AppState::get_session_processing_dir(&session_id)?;

        let is_google_fonts = !matches!(font_set, crate::config::FontSet::SystemFonts);
        let mut db = fontdb::Database::new();
        match font_set {
            crate::config::FontSet::SystemFonts => {
                println!("🔍 Loading system fonts with fontdb...");
                db.load_system_fonts();
            }
            _ => {
                let google_fonts_dir = google_fonts_dir.ok_or_else(|| {
                    AppError::Processing("Google Fonts directory was not prepared".into())
                })?;
                println!("🔍 Loading temporary Google Fonts with fontdb...");
                db.load_fonts_dir(google_fonts_dir);
            }
        }

        let font_faces: Vec<FaceInfo> = db.faces().cloned().collect();
        println!("🔍 Found {} font faces", font_faces.len());

        let preview_text = preview_text.clone();
        let target_weights = target_weights.clone();
        let session_dir = session_dir.clone();
        let is_cancelled = state.is_cancelled.clone();

        let discovered = tokio::task::spawn_blocking(move || -> Result<DiscoveryResult> {
            let mut all_metas = Vec::new();
            for face in font_faces {
                if is_cancelled.load(std::sync::atomic::Ordering::Relaxed) {
                    return Ok(DiscoveryResult {
                        discovered_fonts: HashMap::new(),
                        render_sources: HashMap::new(),
                    });
                }

                if let Ok((data, path)) = Self::source_bytes_and_path(&face.source) {
                    if let Ok(meta) =
                        Self::analyze_font_data(&data, face.index, &preview_text, path, &face)
                    {
                        all_metas.push(meta);
                    }
                }
            }

            println!(
                "🔍 Analyzed {} fonts. Grouping by family...",
                all_metas.len()
            );

            let mut families: HashMap<String, Vec<ExtractedMeta>> = HashMap::new();
            for meta in all_metas {
                let family_name = if is_google_fonts {
                    Self::google_font_family_from_path(&meta.path)
                        .unwrap_or_else(|| Self::internal_family_name(&meta))
                } else {
                    Self::internal_family_name(&meta)
                };
                families.entry(family_name).or_default().push(meta);
            }

            use rayon::prelude::*;
            let target_weights_ref = &target_weights;
            let session_dir_ref = &session_dir;

            let discovered_pairs: Vec<(i32, String, String, FontRenderSource)> = families
                .into_par_iter()
                .map(|(family_name, family_metas)| {
                    if is_cancelled.load(std::sync::atomic::Ordering::Relaxed) {
                        return Vec::new();
                    }

                    let mut local_discovered = Vec::new();
                    let available_weights: Vec<String> = family_metas
                        .iter()
                        .map(|m| format!("Weight({})", m.actual_weight))
                        .collect();

                    for &tw in target_weights_ref {
                        let best = family_metas
                            .iter()
                            .filter(|m| {
                                let diff = m.actual_weight - tw;
                                if tw < 400 {
                                    diff > -50 && diff <= 50
                                } else if tw > 400 {
                                    diff >= -50 && diff < 50
                                } else {
                                    diff > -50 && diff < 50
                                }
                            })
                            .min_by_key(|m| (m.actual_weight - tw).abs());

                        if let Some(meta) = best {
                            let safe_name =
                                crate::config::FontMetadata::generate_safe_name(&family_name, tw);
                            let font_meta = crate::config::FontMetadata {
                                source: if is_google_fonts {
                                    FontSource::GoogleFonts
                                } else {
                                    FontSource::System
                                },
                                safe_name,
                                font_name: meta.display_name.clone(),
                                family_name: family_name.clone(),
                                family_names: meta.family_names.clone(),
                                preferred_family_names: meta.preferred_family_names.clone(),
                                style_name: Self::internal_style_name(meta),
                                style_names: meta.style_names.clone(),
                                preferred_style_names: meta.preferred_style_names.clone(),
                                publishers: meta.publishers.clone(),
                                designers: meta.designers.clone(),
                                copyright: meta.copyright.clone(),
                                trademark: meta.trademark.clone(),
                                version: meta.version.clone(),
                                postscript_name: meta.postscript_name.clone(),
                                description: meta.description.clone(),
                                vendor_url: meta.vendor_url.clone(),
                                designer_url: meta.designer_url.clone(),
                                sample_text: meta.sample_text.clone(),
                                weight: tw,
                                weights: available_weights.clone(),
                                font_index: meta.font_index,
                            };
                            let render_source = FontRenderSource {
                                path: meta.path.clone(),
                                font_index: meta.font_index,
                            };

                            if let Err(e) = crate::core::session::save_font_metadata(
                                session_dir_ref,
                                &font_meta,
                            ) {
                                eprintln!("Failed to save font metadata: {}", e);
                            } else {
                                local_discovered.push((
                                    tw,
                                    family_name.clone(),
                                    font_meta.safe_name.clone(),
                                    render_source,
                                ));
                            }
                        }
                    }
                    local_discovered
                })
                .flatten()
                .collect();

            let mut discovered = HashMap::new();
            let mut render_sources = HashMap::new();
            for w in &target_weights {
                discovered.insert(*w, Vec::new());
            }
            for (tw, family_name, safe_name, render_source) in discovered_pairs {
                if let Some(list) = discovered.get_mut(&tw) {
                    list.push(family_name);
                }
                render_sources.insert(safe_name, render_source);
            }
            Ok(DiscoveryResult {
                discovered_fonts: discovered,
                render_sources,
            })
        })
        .await
        .map_err(|e| AppError::Processing(e.to_string()))??;

        if state
            .is_cancelled
            .load(std::sync::atomic::Ordering::Relaxed)
        {
            return Ok(discovered);
        }

        let total_discovered: usize = discovered.discovered_fonts.values().map(|v| v.len()).sum();
        println!(
            "✅ Discovery complete. Discovered {} font-weight pairs.",
            total_discovered
        );
        for (w, list) in &discovered.discovered_fonts {
            println!("   Weight {}: {} families", w, list.len());
        }

        state.update_session(|session| {
            session.discovered_fonts = discovered.discovered_fonts.clone();
        })?;

        Ok(discovered)
    }
}
