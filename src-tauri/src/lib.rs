use font_kit::source::SystemSource;
use std::collections::HashSet;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn get_system_fonts() -> Vec<String> {
    let source = SystemSource::new();
    let mut font_families = HashSet::new();
    
    match source.all_families() {
        Ok(families) => {
            for family in families {
                font_families.insert(family.to_string());
            }
        }
        Err(_) => {
            // Fallback: return empty vector if font-kit fails
            return Vec::new();
        }
    }
    
    let mut fonts: Vec<String> = font_families.into_iter().collect();
    fonts.sort();
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
