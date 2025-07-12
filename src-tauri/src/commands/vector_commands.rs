use crate::core::{FontImageGenerator, FontImageVectorizer, VectorCompressor, VectorClusterer};
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
pub async fn cluster_compressed_vectors(app_handle: tauri::AppHandle) -> Result<String, String> {
    let clusterer = VectorClusterer::new()
        .map_err(|e| format!("Failed to initialize clusterer: {}", e))?;
    
    clusterer.cluster_compressed_vectors().await
        .map(|output_dir| {
            app_handle.emit("clustering_complete", ())
                .unwrap_or_else(|e| eprintln!("Failed to emit clustering completion event: {}", e));
            format!("Compressed vectors clustered in: {}", output_dir.display())
        })
        .map_err(|e| format!("Vector clustering failed: {}", e))
}