use crate::config::FontSet;
use crate::error::{AppError, Result};
use reqwest::blocking::Client;
use serde::Deserialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::io::Write;
use tauri::Manager;

#[derive(Debug, Deserialize)]
struct GoogleFontMetadata {
    family: String,
    variants: Vec<String>,
    // subsets: Vec<String>,
    // category: String,
    // version: String,
    // #[serde(rename = "lastModified")]
    // last_modified: String,
}

pub fn fetch_subset_fonts(
    font_set: &FontSet,
    target_text: &str,
    session_dir: &Path,
    target_weights: &[i32],
    app_handle: &tauri::AppHandle,
) -> Result<Vec<PathBuf>> {
    let resource_path = app_handle
        .path()
        .resolve("resources/google_fonts.json", tauri::path::BaseDirectory::Resource)
        .map_err(|e| AppError::Io(format!("Failed to resolve google_fonts.json: {}", e)))?;

    // Fallback for dev environment if resource not found (optional, but helpful)
    let json_content = if resource_path.exists() {
        fs::read_to_string(&resource_path)
            .map_err(|e| AppError::Io(format!("Failed to read google_fonts.json: {}", e)))?
    } else {
        // Try relative path for dev
        fs::read_to_string("resources/google_fonts.json")
            .map_err(|e| AppError::Io(format!("Failed to read google_fonts.json (dev): {}", e)))?
    };

    let all_fonts: Vec<GoogleFontMetadata> = serde_json::from_str(&json_content)
        .map_err(|e| AppError::Processing(format!("Failed to parse google_fonts.json: {}", e)))?;

    let limit = match font_set {
        FontSet::SystemFonts => return Ok(Vec::new()), // Should not be called
        FontSet::GoogleFontsTop100 => 100,
        FontSet::GoogleFontsTop300 => 300,
        FontSet::GoogleFontsTop500 => 500,
    };

    let target_fonts = all_fonts.into_iter().take(limit).collect::<Vec<_>>();

    let cache_dir = session_dir.join("google_fonts");
    fs::create_dir_all(&cache_dir)
        .map_err(|e| AppError::Io(format!("Failed to create cache dir: {}", e)))?;

    let client = Client::builder()
        .user_agent("Mozilla/5.0 (FontCluster)")
        .build()
        .map_err(|e| AppError::Processing(format!("Failed to build HTTP client: {}", e)))?;
    
    // TODO: Implement rate limiting properly. For now, sequential or small batches.
    // User said "Rate Limit Strategy is not needed yet".
    
    // Use Rayon for parallel processing if list is large? 
    // Or plain loop since we don't want to blast Google API too hard even without "Strategy".
    // Let's use rayon but maybe with a small chunk size or just sequential for safety first?
    // Given the user instruction, I'll implement a simple parallel loop with rayon but check for errors.
    
    use rayon::prelude::*;
    let downloaded_paths: Arc<Mutex<Vec<PathBuf>>> = Arc::new(Mutex::new(Vec::new()));
    let client = Arc::new(client);

    // We need to encode text for URL.
    let encoded_text = urlencoding::encode(target_text).to_string();
    let target_weights_refs = target_weights;

    target_fonts.par_iter().for_each(|font| {
        let client = Arc::clone(&client);
        let safe_family = font.family.replace(' ', "+");

        // Iterate over requested weights
        for &req_weight in target_weights_refs {
             // Map requested weight (e.g. 700) to possible variants (e.g. "700", "bold", "700italic"?)
             // Simple mapping: 
             // 400 -> "regular", "400"
             // 700 -> "bold", "700"
             // others -> string of number
             
             let candidates = if req_weight == 400 {
                 vec!["regular".to_string(), "400".to_string()]
             } else if req_weight == 700 {
                 vec!["bold".to_string(), "700".to_string()]
             } else {
                 vec![req_weight.to_string()]
             };
             
             // Check if font supports this weight
             let matched_variant = candidates.iter().find(|c| font.variants.contains(c));
             
             if let Some(variant) = matched_variant {
                 // Convert to numeric string for API (Google API wants "400", not "regular" or "bold")
                 let api_weight = if variant == "regular" {
                     "400".to_string()
                 } else if variant == "bold" {
                     "700".to_string()
                 } else {
                      let digits: String = variant.chars().filter(|c| c.is_ascii_digit()).collect();
                      if digits.is_empty() { "400".to_string() } else { digits }
                 };
                 
                 // Construct URL
                 let url = format!(
                    "https://fonts.googleapis.com/css2?family={}:wght@{}&text={}",
                    safe_family, api_weight, encoded_text
                 );
                 
                 // Fetch (Logic duplicated from before, but inside loop)
                 let css_res = (|| -> Result<Vec<u8>> {
                    let resp = client.get(&url).send()
                        .map_err(|e| AppError::Network(format!("Failed to fetch CSS for {} weight {}: {}", font.family, req_weight, e)))?;
                    
                    if !resp.status().is_success() {
                        return Err(AppError::Network(format!("CSS fetch failed {} ({}): {}", font.family, req_weight, resp.status())));
                    }
                    let css = resp.text()
                        .map_err(|e| AppError::Network(format!("Failed to read CSS text: {}", e)))?;

                    // 2. Extract WOFF2 URL
                    let re = regex::Regex::new(r"src:\s*url\s*\((?:'|\x22)?(https?://[^)'\x22]+)(?:'|\x22)?\)").unwrap();
                    let caps = re.captures(&css).ok_or_else(|| AppError::Processing(format!("No WOFF2 URL found in CSS for {} ({})", font.family, req_weight)))?;
                    let woff2_url = &caps[1];
                    
                    // 3. Fetch WOFF2
                    let woff2_resp = client.get(woff2_url).send()
                        .map_err(|e| AppError::Network(format!("Failed to fetch WOFF2: {}", e)))?;
                        
                    if !woff2_resp.status().is_success() {
                         return Err(AppError::Network(format!("WOFF2 fetch failed {} ({}): {}", font.family, req_weight, woff2_resp.status())));
                    }

                    let woff2_data = woff2_resp.bytes()
                        .map_err(|e| AppError::Network(format!("Failed to read WOFF2 bytes: {}", e)))?;

                    // 4. Decode or Save Check
                    let magic = &woff2_data[0..4];
                    let ttf_data = if magic == [0x77, 0x4F, 0x46, 0x32] {
                        // It is WOFF2, decompress
                         wuff::decompress_woff2(&woff2_data)
                            .map_err(|_| {
                                 AppError::Processing(format!("wuff decompression failed. Size: {}", woff2_data.len()))
                            })?
                    } else if magic == [0x00, 0x01, 0x00, 0x00] || magic == [0x4F, 0x54, 0x54, 0x4F] {
                        // It is already TTF/OTF, just use it
                        woff2_data.to_vec()
                    } else {
                         return Err(AppError::Processing(format!("Unknown font format. Header: {:02X?} {:02X?} {:02X?} {:02X?}", 
                            magic[0], magic[1], magic[2], magic[3])));
                    };

                    Ok(ttf_data)
                })();

                match css_res {
                    Ok(font_bytes) => {
                        // Save to file (use .ttf extension, append weight info)
                        let file_name = format!("{}_Weight{}.ttf", font.family.replace(' ', "_"), req_weight);
                        let path = cache_dir.join(&file_name);
                        if let Ok(mut file) = fs::File::create(&path) {
                            if file.write_all(&font_bytes).is_ok() {
                                downloaded_paths.lock().unwrap().push(path);
                            }
                        }
                    },
                    Err(e) => {
                        eprintln!("Error processing {} ({}): {}", font.family, req_weight, e);
                    }
                }
             }
        }
    });

    let paths = Arc::try_unwrap(downloaded_paths).unwrap().into_inner().unwrap();
    Ok(paths)
}
