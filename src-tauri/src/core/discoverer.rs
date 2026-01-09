use crate::error::{Result, AppError};
use crate::core::AppState;
use font_kit::source::SystemSource;
use font_kit::handle::Handle;
use tauri::AppHandle;
use crate::commands::progress::progress_events;
use futures::StreamExt;
use std::collections::HashMap;
use std::fs;
use std::sync::Arc;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ExtractedMeta {
    pub display_name: String,
    pub family_names: HashMap<String, String>,
    pub preferred_family_names: HashMap<String, String>,
    pub publishers: HashMap<String, String>,
    pub designers: HashMap<String, String>,
    pub actual_weight: i32,
    pub available_weights: Vec<String>,
}

pub struct Discoverer {
    source: Arc<SystemSource>,
}

impl Discoverer {
    pub fn new() -> Self {
        Self {
            source: Arc::new(SystemSource::new()),
        }
    }

    pub fn analyze_font_data(data: &[u8], index: u32, target_text: &str) -> Result<ExtractedMeta> {
        let face = ttf_parser::Face::parse(data, index).map_err(|e| AppError::Font(format!("Failed to parse font with ttf-parser: {}", e)))?;

        // 1. Glyph Check
        for ch in target_text.chars() {
            let gid = face.glyph_index(ch).ok_or_else(|| AppError::Font(format!("No glyph for {}", ch)))?;
            if gid.0 == 0 && ch != '\0' && ch != '\u{FFFD}' {
                return Err(AppError::Font(format!("Font fallback detected for character '{}' (missing in cmap)", ch)));
            }
        }

        // 2. Metadata Extraction
        let mut fams = HashMap::new();
        let mut prefs = HashMap::new();
        let mut pubs = HashMap::new();
        let mut dess = HashMap::new();
        let mut full_name = None;

        for rec in face.names().into_iter() {
            let lang_id = rec.language_id.to_string();
            let name_id = rec.name_id;
            if let Some(val) = rec.to_string() {
                match name_id {
                    1 => { fams.insert(lang_id, val); }
                    4 => { if full_name.is_none() || rec.language_id == 1033 { full_name = Some(val); } } // Prefer English for display_name
                    16 => { prefs.insert(lang_id, val); }
                    8 => { pubs.insert(lang_id, val); }
                    9 => { dess.insert(lang_id, val); }
                    _ => {}
                }
            }
        }

        let actual_weight = face.weight().to_number() as i32;

        Ok(ExtractedMeta {
            display_name: full_name.unwrap_or_else(|| "Unknown".to_string()),
            family_names: fams,
            preferred_family_names: prefs,
            publishers: pubs,
            designers: dess,
            actual_weight,
            available_weights: Vec::new(),
        })
    }

    pub async fn discover_fonts(&self, app: &AppHandle, state: &AppState) -> Result<HashMap<i32, Vec<String>>> {
        let (preview_text, target_weights, session_id) = {
            let guard = state.current_session.lock().unwrap();
            let s = guard.as_ref().unwrap();
            (s.preview_text.clone(), s.weights.clone(), s.id.clone())
        };
        let session_dir = AppState::get_base_dir()?.join("Generated").join(&session_id);

        let families = self.source.all_families().unwrap_or_default();
        let total_families = families.len();
        progress_events::reset_progress(app);
        progress_events::set_progress_denominator(app, total_families as i32);

        let mut discovered = HashMap::new();
        for w in &target_weights {
            discovered.insert(*w, Vec::new());
        }

        let results = futures::stream::iter(families)
            .map(|family_name| {
                let source = Arc::clone(&self.source);
                let text = preview_text.clone();
                let weights = target_weights.clone();
                let app_handle = app.clone();
                let session_dir_clone = session_dir.clone();
                
                async move {
                    let mut local_discovered = Vec::new();
                    let family_handle = match source.select_family_by_name(&family_name) {
                        Ok(h) => h,
                        Err(_) => {
                            progress_events::increase_numerator(&app_handle, 1);
                            return local_discovered;
                        }
                    };

                    let mut family_metas = Vec::new();
                    for handle in family_handle.fonts() {
                        let res = match handle {
                            Handle::Path { ref path, font_index } => {
                                if let Ok(data) = fs::read(path) {
                                    Self::analyze_font_data(&data, *font_index, &text)
                                } else {
                                    continue;
                                }
                            }
                            Handle::Memory { ref bytes, font_index } => {
                                Self::analyze_font_data(bytes, *font_index, &text)
                            }
                        };
                        if let Ok(meta) = res {
                            family_metas.push(meta);
                        }
                    }

                    if family_metas.is_empty() {
                        progress_events::increase_numerator(&app_handle, 1);
                        return local_discovered;
                    }

                    let available_weights: Vec<String> = family_metas.iter()
                        .map(|m| format!("Weight({})", m.actual_weight))
                        .collect();

                    for &tw in &weights {
                        let best = family_metas.iter()
                            .filter(|m| (m.actual_weight - tw).abs() <= 50)
                            .min_by_key(|m| (m.actual_weight - tw).abs());

                        if let Some(meta) = best {
                            let safe_name = format!("{}_{}", tw, family_name.replace(' ', "_").replace('/', "_").replace('\\', "_"));
                            
                            let font_meta = crate::config::FontMetadata {
                                safe_name: safe_name.clone(),
                                display_name: meta.display_name.clone(),
                                family: family_name.clone(),
                                family_names: meta.family_names.clone(),
                                preferred_family_names: meta.preferred_family_names.clone(),
                                publishers: meta.publishers.clone(),
                                designers: meta.designers.clone(),
                                weight: tw,
                                weights: available_weights.clone(),
                                computed: None,
                            };

                            if let Err(e) = crate::core::session::save_font_metadata(&session_dir_clone, &font_meta) {
                                eprintln!("Failed to save font metadata: {}", e);
                            }

                            local_discovered.push((tw, family_name.clone()));
                        }
                    }
                    progress_events::increase_numerator(&app_handle, 1);
                    local_discovered
                }
            })
            .buffer_unordered(32)
            .collect::<Vec<Vec<(i32, String)>>>()
            .await;

        for local in results {
            for (w, fam) in local {
                if let Some(list) = discovered.get_mut(&w) {
                    if !list.contains(&fam) {
                        list.push(fam);
                    }
                }
            }
        }

        state.update_status(|s| s.process_status = crate::config::ProcessStatus::Discovered)?;
        let mut guard = state.current_session.lock().unwrap();
        if let Some(session) = guard.as_mut() {
            session.discovered_fonts = discovered.clone();
            let session_dir_final = AppState::get_base_dir()?.join("Generated").join(&session.id);
            fs::write(session_dir_final.join("config.json"), serde_json::to_string_pretty(&session)?)?;
        }

        Ok(discovered)
    }
}
