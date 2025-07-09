use crate::core::{FontImageGenerator, FontImageVectorizer, VectorCompressor};
use crate::config::FONT_SIZE;
use tauri::Emitter;

#[tauri::command]
pub async fn generate_font_images(text: Option<String>, app_handle: tauri::AppHandle) -> Result<String, String> {
    let generator = FontImageGenerator::new(text, FONT_SIZE)
        .map_err(|e| format!("Failed to initialize generator: {}", e))?;
    
    match generator.generate_all().await {
        Ok(output_dir) => {
            if let Err(e) = app_handle.emit("font_generation_complete", ()) {
                eprintln!("Failed to emit completion event: {}", e);
            }
            Ok(format!("Font images generated in: {}", output_dir.display()))
        }
        Err(e) => Err(format!("Font generation failed: {}", e))
    }
}

#[tauri::command]
pub async fn vectorize_font_images(app_handle: tauri::AppHandle) -> Result<String, String> {
    let vectorizer = FontImageVectorizer::new()
        .map_err(|e| format!("Failed to initialize vectorizer: {}", e))?;
    
    match vectorizer.vectorize_all().await {
        Ok(output_dir) => {
            if let Err(e) = app_handle.emit("vectorization_complete", ()) {
                eprintln!("Failed to emit vectorization completion event: {}", e);
            }
            Ok(format!("Font images vectorized in: {}", output_dir.display()))
        }
        Err(e) => Err(format!("Vectorization failed: {}", e))
    }
}

#[tauri::command]
pub async fn compress_vectors_to_2d(app_handle: tauri::AppHandle) -> Result<String, String> {
    let compressor = VectorCompressor::new()
        .map_err(|e| format!("Failed to initialize compressor: {}", e))?;
    
    match compressor.compress_all().await {
        Ok(output_dir) => {
            if let Err(e) = app_handle.emit("compression_complete", ()) {
                eprintln!("Failed to emit compression completion event: {}", e);
            }
            Ok(format!("Vectors compressed to 2D in: {}", output_dir.display()))
        }
        Err(e) => Err(format!("Vector compression failed: {}", e))
    }
}