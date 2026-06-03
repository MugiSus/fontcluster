use crate::config::FontSet;
use crate::core::AppState;
use crate::error::{AppError, Result};
use reqwest::blocking::Client;
use serde::Deserialize;
use std::collections::HashSet;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

#[derive(Debug, Deserialize)]
struct GoogleFontMetadata {
    family: String,
    variants: Vec<String>,
    subsets: Vec<String>,
    // category: String,
    // version: String,
    // last_modified: String,
}

fn text_subset_requirements(target_text: &str) -> Vec<Vec<&'static str>> {
    target_text
        .chars()
        .filter(|ch| !ch.is_whitespace() && !ch.is_control())
        .filter_map(|ch| {
            let subsets = google_fonts_subsets::subsets_for_codepoint(ch as u32);
            let subsets = subsets
                .into_iter()
                .filter(|subset| *subset != "menu")
                .collect::<Vec<_>>();

            if subsets.is_empty() {
                None
            } else {
                Some(subsets)
            }
        })
        .collect()
}

fn font_matches_subset_requirements(
    font_subsets: &[String],
    requirements: &[Vec<&'static str>],
) -> bool {
    let font_subsets = font_subsets
        .iter()
        .map(String::as_str)
        .collect::<HashSet<_>>();

    requirements.iter().all(|candidate_subsets| {
        candidate_subsets
            .iter()
            .any(|subset| font_subsets.contains(subset))
    })
}

fn google_font_api_weight(req_weight: i32, variants: &[String]) -> Option<String> {
    let candidates = if req_weight == 400 {
        vec!["regular".to_string(), "400".to_string()]
    } else if req_weight == 700 {
        vec!["bold".to_string(), "700".to_string()]
    } else {
        vec![req_weight.to_string()]
    };

    let variant = candidates.iter().find(|c| variants.contains(c))?;
    if variant == "regular" {
        Some("400".to_string())
    } else if variant == "bold" {
        Some("700".to_string())
    } else {
        let digits = variant
            .chars()
            .filter(|c| c.is_ascii_digit())
            .collect::<String>();
        Some(if digits.is_empty() {
            "400".to_string()
        } else {
            digits
        })
    }
}

fn load_google_fonts_metadata() -> Result<Vec<GoogleFontMetadata>> {
    let resource_path = resolve_google_fonts_popularity_path();
    let json_content = if resource_path.exists() {
        fs::read_to_string(&resource_path).map_err(|e| {
            AppError::Io(format!(
                "Failed to read google_fonts_popularity.json: {}",
                e
            ))
        })?
    } else {
        fs::read_to_string("resources/google_fonts_popularity.json").map_err(|e| {
            AppError::Io(format!(
                "Failed to read google_fonts_popularity.json (dev): {}",
                e
            ))
        })?
    };

    serde_json::from_str(&json_content).map_err(|e| {
        AppError::Processing(format!(
            "Failed to parse google_fonts_popularity.json: {}",
            e
        ))
    })
}

fn fetch_google_font_subset_bytes(
    client: &Client,
    family: &str,
    weight: i32,
    api_weight: &str,
    text: &str,
) -> Result<Vec<u8>> {
    let safe_family = family.replace(' ', "+");
    let encoded_text = urlencoding::encode(text).to_string();
    let url = format!(
        "https://fonts.googleapis.com/css2?family={}:wght@{}&text={}",
        safe_family, api_weight, encoded_text
    );

    let resp = client.get(&url).send().map_err(|e| {
        AppError::Network(format!(
            "Failed to fetch CSS for {} weight {}: {}",
            family, weight, e
        ))
    })?;

    if !resp.status().is_success() {
        return Err(AppError::Network(format!(
            "CSS fetch failed {} ({}): {}",
            family,
            weight,
            resp.status()
        )));
    }
    let css = resp
        .text()
        .map_err(|e| AppError::Network(format!("Failed to read CSS text: {}", e)))?;

    let re =
        regex::Regex::new(r"src:\s*url\s*\((?:'|\x22)?(https?://[^)'\x22]+)(?:'|\x22)?\)").unwrap();
    let caps = re.captures(&css).ok_or_else(|| {
        AppError::Processing(format!(
            "No WOFF2 URL found in CSS for {} ({})",
            family, weight
        ))
    })?;
    let woff2_url = &caps[1];

    let woff2_resp = client
        .get(woff2_url)
        .send()
        .map_err(|e| AppError::Network(format!("Failed to fetch WOFF2: {}", e)))?;

    if !woff2_resp.status().is_success() {
        return Err(AppError::Network(format!(
            "WOFF2 fetch failed {} ({}): {}",
            family,
            weight,
            woff2_resp.status()
        )));
    }

    let font_data = woff2_resp
        .bytes()
        .map_err(|e| AppError::Network(format!("Failed to read WOFF2 bytes: {}", e)))?;
    let magic = font_data.get(0..4).ok_or_else(|| {
        AppError::Processing(format!(
            "Downloaded font is too small. Size: {}",
            font_data.len()
        ))
    })?;

    if magic == [0x77, 0x4F, 0x46, 0x32] {
        wuff::decompress_woff2(&font_data).map_err(|_| {
            AppError::Processing(format!(
                "wuff decompression failed. Size: {}",
                font_data.len()
            ))
        })
    } else if magic == [0x00, 0x01, 0x00, 0x00] || magic == [0x4F, 0x54, 0x54, 0x4F] {
        Ok(font_data.to_vec())
    } else {
        Err(AppError::Processing(format!(
            "Unknown font format. Header: {:02X?} {:02X?} {:02X?} {:02X?}",
            magic[0], magic[1], magic[2], magic[3]
        )))
    }
}

pub(crate) fn download_google_font_subset_temp(
    family: &str,
    weight: i32,
    text: &str,
) -> Result<tempfile::NamedTempFile> {
    let client = Client::builder()
        .user_agent("Mozilla/5.0 (FontCluster)")
        .build()
        .map_err(|e| AppError::Processing(format!("Failed to build HTTP client: {}", e)))?;
    let all_fonts = load_google_fonts_metadata()?;
    let font = all_fonts
        .iter()
        .find(|font| font.family == family)
        .ok_or_else(|| AppError::Processing(format!("Google Font not found: {}", family)))?;
    let api_weight = google_font_api_weight(weight, &font.variants).ok_or_else(|| {
        AppError::Processing(format!(
            "Google Font variant not found: {} weight {}",
            family, weight
        ))
    })?;
    let font_bytes = fetch_google_font_subset_bytes(&client, family, weight, &api_weight, text)?;
    let mut file = tempfile::NamedTempFile::new()
        .map_err(|e| AppError::Io(format!("Failed to create temporary font file: {}", e)))?;
    file.write_all(&font_bytes)
        .map_err(|e| AppError::Io(format!("Failed to write temporary font file: {}", e)))?;
    Ok(file)
}

pub struct GoogleFontsDownloader {}

impl GoogleFontsDownloader {
    pub fn new() -> Self {
        Self {}
    }

    pub async fn download_fonts_to_dir(
        &self,
        state: &AppState,
        output_dir: PathBuf,
    ) -> Result<Vec<PathBuf>> {
        let (font_set, text, target_weights) = {
            let guard = state.current_session.lock().unwrap();
            let session = guard
                .as_ref()
                .ok_or_else(|| AppError::Processing("No active session".into()))?;
            let rendering = &session.algorithm.rendering;

            (
                rendering.font_set.clone(),
                rendering.text.clone(),
                rendering.weights.clone(),
            )
        };
        tokio::task::spawn_blocking(move || {
            download_fonts_impl(&font_set, &text, &output_dir, &target_weights)
        })
        .await
        .map_err(|e| AppError::Processing(e.to_string()))?
    }
}

fn download_fonts_impl(
    font_set: &FontSet,
    target_text: &str,
    output_dir: &Path,
    target_weights: &[i32],
) -> Result<Vec<PathBuf>> {
    let all_fonts = load_google_fonts_metadata()?;

    let limit = match font_set {
        FontSet::SystemFonts => return Ok(Vec::new()),
        FontSet::GoogleFontsPopular100 => Some(100),
        FontSet::GoogleFontsPopular200 => Some(200),
        FontSet::GoogleFontsPopular300 => Some(300),
        FontSet::GoogleFontsPopular500 => Some(500),
        FontSet::GoogleFontsPopular1000 => Some(1000),
        FontSet::GoogleFontsPopular1500 => Some(1500),
        FontSet::GoogleFontsAll => None,
    };

    let subset_requirements = text_subset_requirements(target_text);
    println!(
        "🔍 Google Fonts subset requirements: {:?}",
        subset_requirements
    );
    let total_fonts_before_subset_filter = all_fonts.len();
    let target_fonts = all_fonts
        .into_iter()
        .filter(|font| font_matches_subset_requirements(&font.subsets, &subset_requirements))
        .collect::<Vec<_>>();
    let total_fonts_after_subset_filter = target_fonts.len();
    let target_fonts = target_fonts
        .into_iter()
        .filter(|font| {
            target_weights
                .iter()
                .any(|&weight| google_font_api_weight(weight, &font.variants).is_some())
        })
        .collect::<Vec<_>>();
    let total_fonts_after_weight_filter = target_fonts.len();
    let target_fonts = match limit {
        Some(limit) => target_fonts.into_iter().take(limit).collect::<Vec<_>>(),
        None => target_fonts,
    };

    println!(
        "🔍 Google Fonts candidate prefilter: {} -> {} subset matches -> {} weight matches, selected {}",
        total_fonts_before_subset_filter,
        total_fonts_after_subset_filter,
        total_fonts_after_weight_filter,
        target_fonts.len()
    );

    fs::create_dir_all(output_dir)
        .map_err(|e| AppError::Io(format!("Failed to create cache dir: {}", e)))?;

    let client = Client::builder()
        .user_agent("Mozilla/5.0 (FontCluster)")
        .build()
        .map_err(|e| AppError::Processing(format!("Failed to build HTTP client: {}", e)))?;

    use rayon::prelude::*;
    let downloaded_paths: Arc<Mutex<Vec<PathBuf>>> = Arc::new(Mutex::new(Vec::new()));
    let client = Arc::new(client);
    target_fonts.par_iter().for_each(|font| {
        let client = Arc::clone(&client);

        for &req_weight in target_weights {
            let Some(api_weight) = google_font_api_weight(req_weight, &font.variants) else {
                continue;
            };

            let result = fetch_google_font_subset_bytes(
                &client,
                &font.family,
                req_weight,
                &api_weight,
                target_text,
            );
            match result {
                Ok(font_bytes) => {
                    let file_name =
                        format!("{}_Weight{}.ttf", font.family.replace(' ', "_"), req_weight);
                    let path = output_dir.join(&file_name);
                    if let Ok(mut file) = fs::File::create(&path) {
                        if file.write_all(&font_bytes).is_ok() {
                            downloaded_paths.lock().unwrap().push(path);
                        }
                    }
                }
                Err(e) => {
                    eprintln!("Error processing {} ({}): {}", font.family, req_weight, e);
                }
            }
        }
    });

    let paths = Arc::try_unwrap(downloaded_paths)
        .unwrap()
        .into_inner()
        .unwrap();
    Ok(paths)
}

fn resolve_google_fonts_popularity_path() -> PathBuf {
    let mut roots = vec![
        PathBuf::from("src-tauri/resources"),
        PathBuf::from("resources"),
    ];

    if let Ok(resource_dir) = std::env::var("FONTCLUSTER_RESOURCE_DIR") {
        roots.push(PathBuf::from(resource_dir).join("resources"));
    }

    if let Ok(exe) = std::env::current_exe() {
        if let Some(exe_dir) = exe.parent() {
            roots.push(exe_dir.join("../Resources/resources"));
            roots.push(exe_dir.join("resources"));
        }
    }

    roots
        .into_iter()
        .map(|root| root.join("google_fonts_popularity.json"))
        .find(|path| path.exists())
        .unwrap_or_else(|| PathBuf::from("resources/google_fonts_popularity.json"))
}
