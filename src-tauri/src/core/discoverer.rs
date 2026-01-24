use crate::error::{Result, AppError};
use crate::core::AppState;
use tauri::AppHandle;
use crate::commands::progress::progress_events;
// use futures::StreamExt as _; 
use std::fs;
use std::collections::HashMap;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ExtractedMeta {
    pub display_name: String,
    pub family_names: HashMap<String, String>,
    pub preferred_family_names: HashMap<String, String>,
    pub publishers: HashMap<String, String>,
    pub designers: HashMap<String, String>,
    pub actual_weight: i32,
    pub available_weights: Vec<String>,
    pub path: std::path::PathBuf,
    pub font_index: u32,
}

pub struct Discoverer {
}

impl Discoverer {
    pub fn new() -> Self {
        Self {}
    }

    fn get_font_files() -> Vec<std::path::PathBuf> {
        let mut search_dirs = Vec::new();
        if cfg!(target_os = "macos") {
            search_dirs.push(std::path::PathBuf::from("/System/Library/Fonts"));
            search_dirs.push(std::path::PathBuf::from("/Library/Fonts"));
            if let Some(user_font_dir) = dirs::font_dir() {
                search_dirs.push(user_font_dir);
            }
        } else if cfg!(target_os = "windows") {
            if let Some(win_dir) = std::env::var_os("WINDIR") {
                search_dirs.push(std::path::PathBuf::from(win_dir).join("Fonts"));
            }
        } else {
            // Basic Linux paths
            search_dirs.push(std::path::PathBuf::from("/usr/share/fonts"));
            search_dirs.push(std::path::PathBuf::from("/usr/local/share/fonts"));
            if let Some(user_font_dir) = dirs::font_dir() {
                search_dirs.push(user_font_dir);
            }
        }

        let mut files = Vec::new();
        for dir in search_dirs {
            Self::walk_dir(&dir, &mut files);
        }
        files
    }

    fn walk_dir(dir: &std::path::PathBuf, files: &mut Vec<std::path::PathBuf>) {
        for entry in jwalk::WalkDir::new(dir)
            .follow_links(true)
            .into_iter()
            .filter_map(|e| e.ok()) {
                if entry.file_type().is_file() {
                    if let Some(ext) = entry.path().extension().and_then(|e| e.to_str()) {
                        let ext = ext.to_lowercase();
                        if ext == "ttf" || ext == "otf" || ext == "ttc" || ext == "otc" {
                            files.push(entry.path());
                        }
                    }
                }
            }
    }

    pub fn analyze_font_data(data: &[u8], index: u32, target_text: &str, path: std::path::PathBuf) -> Result<ExtractedMeta> {
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
                if val.contains("LastResort") || val.starts_with('.') {
                    return Err(AppError::Font(format!("Skipping system internal font: {}", val)));
                }

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
            path,
            font_index: index,
        })
    }

    pub async fn discover_fonts(&self, app: &AppHandle, state: &AppState) -> Result<HashMap<i32, Vec<String>>> {
        let (preview_text, target_weights, session_id) = {
            let guard = state.current_session.lock().unwrap();
            let s = guard.as_ref().unwrap();
            (s.preview_text.clone(), s.weights.clone(), s.id.clone())
        };
        let session_dir = AppState::get_base_dir()?.join("Generated").join(&session_id);

        println!("🔍 Scanning system for font files...");
        let font_files = Self::get_font_files();
        let total_files = font_files.len();
        println!("🔍 Found {} font files on system", total_files);
        
        progress_events::reset_progress(app);
        progress_events::set_progress_denominator(app, total_files as i32);

        let app_handle = app.clone();
        let preview_text = preview_text.clone();
        let target_weights = target_weights.clone();
        let session_dir = session_dir.clone();

        let discovered = tokio::task::spawn_blocking(move || -> Result<HashMap<i32, Vec<String>>> {
            let mut results = Vec::new();
            for path in font_files {
                let mut local_metas = Vec::new();
                if let Ok(file) = fs::File::open(&path) {
                    if let Ok(mmap) = unsafe { memmap2::Mmap::map(&file) } {
                        let count = ttf_parser::fonts_in_collection(&mmap).unwrap_or(1);
                        for i in 0..count {
                            if let Ok(meta) =
                                Self::analyze_font_data(&mmap, i, &preview_text, path.clone())
                            {
                                local_metas.push(meta);
                            }
                        }
                    }
                }
                progress_events::increase_numerator(&app_handle, 1);
                results.push(local_metas);
            }

            let all_metas: Vec<ExtractedMeta> = results.into_iter().flatten().collect();
            println!("🔍 Analyzed {} fonts. Grouping by family...", all_metas.len());

            let mut families: HashMap<String, Vec<ExtractedMeta>> = HashMap::new();
            for meta in all_metas {
                let family_name = meta
                    .preferred_family_names
                    .get("1033")
                    .or_else(|| meta.family_names.get("1033"))
                    .unwrap_or(&meta.display_name)
                    .clone();
                families.entry(family_name).or_default().push(meta);
            }

            use rayon::prelude::*;
            let target_weights_ref = &target_weights;
            let session_dir_ref = &session_dir;

            let discovered_pairs: Vec<(i32, String)> = families
                .into_par_iter()
                .map(|(family_name, family_metas)| {
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
                                safe_name,
                                display_name: meta.display_name.clone(),
                                family: family_name.clone(),
                                family_names: meta.family_names.clone(),
                                preferred_family_names: meta.preferred_family_names.clone(),
                                publishers: meta.publishers.clone(),
                                designers: meta.designers.clone(),
                                weight: tw,
                                weights: available_weights.clone(),
                                path: Some(meta.path.clone()),
                                font_index: meta.font_index,
                                computed: None,
                            };

                            if let Err(e) =
                                crate::core::session::save_font_metadata(session_dir_ref, &font_meta)
                            {
                                eprintln!("Failed to save font metadata: {}", e);
                            } else {
                                local_discovered.push((tw, family_name.clone()));
                            }
                        }
                    }
                    local_discovered
                })
                .flatten()
                .collect();

            let mut discovered = HashMap::new();
            for w in &target_weights {
                discovered.insert(*w, Vec::new());
            }
            for (tw, family_name) in discovered_pairs {
                if let Some(list) = discovered.get_mut(&tw) {
                    list.push(family_name);
                }
            }
            Ok(discovered)
        })
        .await
        .map_err(|e| AppError::Processing(e.to_string()))??;

        let total_discovered: usize = discovered.values().map(|v| v.len()).sum();
        println!(
            "✅ Discovery complete. Discovered {} font-weight pairs.",
            total_discovered
        );
        for (w, list) in &discovered {
            println!("   Weight {}: {} families", w, list.len());
        }

        state.update_status(|s| s.process_status = crate::config::ProcessStatus::Discovered)?;
        let mut guard = state.current_session.lock().unwrap();
        if let Some(session) = guard.as_mut() {
            session.discovered_fonts = discovered.clone();
            let session_dir_final = AppState::get_base_dir()?.join("Generated").join(&session.id);
            let config_path = session_dir_final.join("config.json");
            fs::write(
                &config_path,
                serde_json::to_string_pretty(&session)?,
            ).map_err(|e| AppError::Io(format!("Failed to write session config in discoverer {}: {}", config_path.display(), e)))?;
        }

        Ok(discovered)
    }
}
