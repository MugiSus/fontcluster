use std::fs;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn get_system_fonts() -> Vec<String> {
    let mut fonts = Vec::new();
    
    // macOS system font directories
    let home_fonts = format!("{}/Library/Fonts", std::env::var("HOME").unwrap_or_default());
    let font_dirs = vec![
        "/System/Library/Fonts",
        "/Library/Fonts",
        &home_fonts,
    ];
    
    for dir in font_dirs {
        if let Ok(entries) = fs::read_dir(dir) {
            for entry in entries {
                if let Ok(entry) = entry {
                    let path = entry.path();
                    if let Some(extension) = path.extension() {
                        if let Some(ext_str) = extension.to_str() {
                            if matches!(ext_str.to_lowercase().as_str(), "ttf" | "otf" | "ttc" | "dfont") {
                                if let Some(file_name) = path.file_stem() {
                                    if let Some(name) = file_name.to_str() {
                                        // Remove common suffixes like -Bold, -Italic, etc.
                                        let clean_name = name
                                            .replace("-Bold", "")
                                            .replace("-Italic", "")
                                            .replace("-Regular", "")
                                            .replace("-Light", "")
                                            .replace("-Medium", "")
                                            .replace("-Heavy", "")
                                            .replace("-Black", "")
                                            .replace("-Thin", "")
                                            .replace("Bold", "")
                                            .replace("Italic", "")
                                            .replace("Regular", "");
                                        
                                        let font_name = clean_name.trim_end_matches('-').to_string();
                                        if !fonts.contains(&font_name) && !font_name.is_empty() {
                                            fonts.push(font_name);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    
    fonts.sort();
    fonts.dedup();
    fonts
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![greet, get_system_fonts])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
