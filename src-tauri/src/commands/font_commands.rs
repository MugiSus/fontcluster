use crate::core::FontService;

// Tauri command handlers
#[tauri::command]
pub fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
pub fn get_system_fonts() -> Vec<String> {
    FontService::get_system_fonts()
}

#[tauri::command]
pub fn get_compressed_vectors() -> Result<Vec<(String, f64, f64)>, String> {
    let comp_vector_dir = FontService::get_compressed_vectors_directory()
        .map_err(|e| format!("Failed to get compressed vector directory: {}", e))?;
    
    let mut coordinates = Vec::new();
    
    for entry in std::fs::read_dir(&comp_vector_dir).map_err(|e| format!("Failed to read directory: {}", e))? {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let path = entry.path();
        
        if path.extension().and_then(|ext| ext.to_str()) == Some("csv") {
            match std::fs::read_to_string(&path) {
                Ok(content) => {
                    let values: Vec<&str> = content.trim().split(',').collect();
                    if values.len() >= 3 {
                        let font_name = values[0];
                        if let (Ok(x), Ok(y)) = (values[1].parse::<f64>(), values[2].parse::<f64>()) {
                            coordinates.push((font_name.to_string(), x, y));
                        }
                    }
                }
                Err(e) => eprintln!("Failed to read file {}: {}", path.display(), e),
            }
        }
    }
    
    Ok(coordinates)
}