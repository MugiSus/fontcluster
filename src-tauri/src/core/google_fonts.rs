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
        FontSet::GoogleFontsAll => all_fonts.len(),
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

    target_fonts.par_iter().for_each(|font| {
        let client = Arc::clone(&client);
        let safe_family = font.family.replace(' ', "+");
        // Try to find regular or 400, else first available
        let weight = if font.variants.contains(&"regular".to_string()) {
            "regular"
        } else if font.variants.contains(&"400".to_string()) {
            "400"
        } else {
            font.variants.first().map(|s| s.as_str()).unwrap_or("regular")
        };
        
        let url = format!(
            "https://fonts.googleapis.com/css2?family={}:wght@{}&text={}",
            safe_family, weight, encoded_text
        );

        // 1. Fetch CSS
        let css_res = (|| -> Result<Vec<u8>> {
            let resp = client.get(&url).send()
                .map_err(|e| AppError::Network(format!("Failed to fetch CSS for {}: {}", font.family, e)))?;
            
            if !resp.status().is_success() {
                return Err(AppError::Network(format!("CSS fetch failed {}: {}", font.family, resp.status())));
            }
            let css = resp.text()
                .map_err(|e| AppError::Network(format!("Failed to read CSS text: {}", e)))?;

            // 2. Extract WOFF2 URL
            // Simple regex: src: url\((https?://[^\)]+)\)
            let re = regex::Regex::new(r"src:\s*url\((https?://[^)]+)\)").unwrap();
            let caps = re.captures(&css).ok_or_else(|| AppError::Processing(format!("No WOFF2 URL found in CSS for {}", font.family)))?;
            let woff2_url = &caps[1];

            // 3. Fetch WOFF2
            let woff2_resp = client.get(woff2_url).send()
                .map_err(|e| AppError::Network(format!("Failed to fetch WOFF2: {}", e)))?;
            let woff2_data = woff2_resp.bytes()
                .map_err(|e| AppError::Network(format!("Failed to read WOFF2 bytes: {}", e)))?;

            // 4. Skip Decoding (Try using WOFF2 directly supported by macOS/CoreText)
            let ttf_data = woff2_data.to_vec();
            
            Ok(ttf_data)
        })();

        match css_res {
            Ok(font_bytes) => {
                // Save to file (use .woff2 extension)
                let file_name = format!("{}_{}.woff2", font.family.replace(' ', "_"), weight);
                let path = cache_dir.join(&file_name);
                if let Ok(mut file) = fs::File::create(&path) {
                    if file.write_all(&font_bytes).is_ok() {
                        downloaded_paths.lock().unwrap().push(path);
                    }
                }
            },
            Err(e) => {
                eprintln!("Error processing {}: {}", font.family, e);
            }
        }
    });

    let paths = Arc::try_unwrap(downloaded_paths).unwrap().into_inner().unwrap();
    Ok(paths)
}
