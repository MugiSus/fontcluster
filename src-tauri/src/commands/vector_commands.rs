use crate::core::{FontImageGenerator, FontImageVectorizer, VectorCompressor, VectorClusterer};
use crate::config::FONT_SIZE;
use crate::utils::{with_progress_events_async, format_completion_message};
use tauri::AppHandle;

#[tauri::command]
pub async fn generate_font_images(text: Option<String>, weights: Option<Vec<i32>>, app_handle: AppHandle) -> Result<String, String> {
    async {
        let font_weights = weights.unwrap_or_else(|| vec![400]);
        let generator = FontImageGenerator::new(text, FONT_SIZE, font_weights)?;
        
        with_progress_events_async(
            app_handle.clone(),
            "font_generation_start",
            "font_generation_complete",
            || generator.generate_all(&app_handle)
        ).await
        .map(format_completion_message("Font images generated"))
    }
    .await
    .map_err(|e| format!("Font generation failed: {}", e))
}

#[tauri::command]
pub async fn vectorize_font_images(app_handle: AppHandle) -> Result<String, String> {
    async {
        let vectorizer = FontImageVectorizer::new()?;
        
        with_progress_events_async(
            app_handle.clone(),
            "vectorization_start",
            "vectorization_complete",
            || vectorizer.vectorize_all(&app_handle)
        ).await
        .map(format_completion_message("Font images vectorized"))
    }
    .await
    .map_err(|e| format!("Vectorization failed: {}", e))
}

#[tauri::command]
pub async fn compress_vectors_to_2d(app_handle: AppHandle) -> Result<String, String> {
    async {
        let compressor = VectorCompressor::new()?;
        
        with_progress_events_async(
            app_handle.clone(),
            "compression_start",
            "compression_complete",
            || compressor.compress_all()
        ).await
        .map(format_completion_message("Vectors compressed to 2D"))
    }
    .await
    .map_err(|e| format!("Vector compression failed: {}", e))
}

#[tauri::command]
pub async fn cluster_compressed_vectors(app_handle: AppHandle) -> Result<String, String> {
    async {
        let clusterer = VectorClusterer::new()?;
        
        with_progress_events_async(
            app_handle.clone(),
            "clustering_start",
            "clustering_complete",
            || clusterer.cluster_compressed_vectors()
        ).await
        .map(|(path, _cluster_size, _sample_amount)| format_completion_message("Compressed vectors clustered")(path))
    }
    .await
    .map_err(|e| format!("Vector clustering failed: {}", e))
}