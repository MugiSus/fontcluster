use crate::core::{FontImageGenerator, FontImageVectorizer, VectorCompressor, FontClassifier, SessionManager};
use crate::config::FONT_SIZE;
use tauri::Emitter;

#[tauri::command]
pub async fn generate_font_images(text: Option<String>, app_handle: tauri::AppHandle) -> Result<String, String> {
    let generator = FontImageGenerator::new(text, FONT_SIZE)
        .map_err(|e| format!("Failed to initialize generator: {}", e))?;
    
    generator.generate_all().await
        .map(|output_dir| {
            app_handle.emit("font_generation_complete", ())
                .unwrap_or_else(|e| eprintln!("Failed to emit completion event: {}", e));
            format!("Font images generated in: {}", output_dir.display())
        })
        .map_err(|e| format!("Font generation failed: {}", e))
}

#[tauri::command]
pub async fn vectorize_font_images(app_handle: tauri::AppHandle) -> Result<String, String> {
    let vectorizer = FontImageVectorizer::new()
        .map_err(|e| format!("Failed to initialize vectorizer: {}", e))?;
    
    vectorizer.vectorize_all().await
        .map(|output_dir| {
            app_handle.emit("vectorization_complete", ())
                .unwrap_or_else(|e| eprintln!("Failed to emit vectorization completion event: {}", e));
            format!("Font images vectorized in: {}", output_dir.display())
        })
        .map_err(|e| format!("Vectorization failed: {}", e))
}

#[tauri::command]
pub async fn compress_vectors_to_2d(app_handle: tauri::AppHandle) -> Result<String, String> {
    let compressor = VectorCompressor::new()
        .map_err(|e| format!("Failed to initialize compressor: {}", e))?;
    
    compressor.compress_all().await
        .map(|output_dir| {
            app_handle.emit("compression_complete", ())
                .unwrap_or_else(|e| eprintln!("Failed to emit compression completion event: {}", e));
            format!("Vectors compressed to 2D in: {}", output_dir.display())
        })
        .map_err(|e| format!("Vector compression failed: {}", e))
}

#[tauri::command]
pub async fn classify_all_fonts(app_handle: tauri::AppHandle) -> Result<String, String> {
    let classifier = FontClassifier::load_pretrained()
        .map_err(|e| format!("Failed to load classifier: {}", e))?;
    
    let session_manager = SessionManager::global();
    let session_dir = session_manager.get_session_dir();
    
    // Get all font directories
    let font_dirs: Vec<_> = std::fs::read_dir(&session_dir)
        .map_err(|e| format!("Failed to read session directory: {}", e))?
        .filter_map(Result::ok)
        .filter(|entry| entry.path().is_dir())
        .collect();
    
    let mut classified_count = 0;
    
    for entry in font_dirs {
        let font_name = entry.file_name().to_string_lossy().to_string();
        
        // Check if compressed vector exists
        let vector_file = entry.path().join("compressed-vector.csv");
        if !vector_file.exists() {
            continue;
        }
        
        // Classify the font
        match classifier.classify_font(&font_name).await {
            Ok(category_id) => {
                let category_str = match category_id {
                    0 => "Sans Serif",
                    1 => "Serif", 
                    2 => "Handwriting",
                    3 => "Monospace",
                    4 => "Display",
                    -1 => "Unknown",
                    _ => "Unknown",
                };
                
                // Update compressed-vector.csv with category instead of cluster
                let content = std::fs::read_to_string(&vector_file)
                    .map_err(|e| format!("Failed to read vector file for {}: {}", font_name, e))?;
                
                let coords: Vec<&str> = content.trim().split(',').take(2).collect();
                if coords.len() >= 2 {
                    let updated_content = format!("{},{},{}", coords[0], coords[1], category_id);
                    std::fs::write(&vector_file, updated_content)
                        .map_err(|e| format!("Failed to update vector file for {}: {}", font_name, e))?;
                }
                
                classified_count += 1;
                println!("✓ Classified '{}' as {}", font_name, category_str);
            }
            Err(e) => {
                eprintln!("Failed to classify {}: {}", font_name, e);
            }
        }
    }
    
    app_handle.emit("classification_complete", ())
        .unwrap_or_else(|e| eprintln!("Failed to emit classification completion event: {}", e));
        
    Ok(format!("Classified {} fonts using supervised learning in: {}", classified_count, session_dir.display()))
}