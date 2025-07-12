use crate::core::{FontImageGenerator, FontImageVectorizer, VectorCompressor, VectorClusterer, SessionManager};
use crate::config::FONT_SIZE;
use crate::utils::{Pipeline, with_text_or_default, with_progress_events_async};
use tauri::AppHandle;

/// Single command to run all font processing jobs sequentially
/// 
/// This replaces the need for frontend to call multiple commands individually.
/// Each step emits completion events that the frontend can listen to for state updates.
#[tauri::command]
pub async fn run_jobs(text: Option<String>, app_handle: AppHandle) -> Result<String, String> {
    async {
        let processing_text = with_text_or_default("A quick brown fox jumps over the lazy dog")(text);
        println!("🚀 Starting complete font processing pipeline with text: '{}'", processing_text);

        // Create functional pipeline
        let _result = Pipeline::new(processing_text.clone())
            .inspect(|text| println!("📂 Step 0/4: Creating new session for text: '{}'", text))
            .then(|text| {
                SessionManager::create_new_session_with_text(text.clone())
                    .map(|session_id| {
                        println!("✅ Session created: {}", session_id);
                        text
                    })
            })
            
            .inspect(|_| println!("🎨 Step 1/4: Generating font images..."))
            .then_async(|text| async {
                let generator = FontImageGenerator::new(Some(text.clone()), FONT_SIZE)?;
                with_progress_events_async(
                    app_handle.clone(),
                    "font_generation_start", 
                    "font_generation_complete",
                    || generator.generate_all()
                ).await
                .map(|path| {
                    println!("✅ Font images generated in: {}", path.display());
                    text
                })
            }).await
            
            .inspect(|_| println!("🔢 Step 2/4: Vectorizing font images..."))
            .then_async(|text| async {
                let vectorizer = FontImageVectorizer::new()?;
                with_progress_events_async(
                    app_handle.clone(),
                    "vectorization_start",
                    "vectorization_complete", 
                    || vectorizer.vectorize_all()
                ).await
                .map(|path| {
                    println!("✅ Font images vectorized in: {}", path.display());
                    text
                })
            }).await
            
            .inspect(|_| println!("📐 Step 3/4: Compressing vectors to 2D..."))
            .then_async(|text| async {
                let compressor = VectorCompressor::new()?;
                with_progress_events_async(
                    app_handle.clone(),
                    "compression_start",
                    "compression_complete",
                    || compressor.compress_all()
                ).await
                .map(|path| {
                    println!("✅ Vectors compressed to 2D in: {}", path.display());
                    text
                })
            }).await
            
            .inspect(|_| println!("🎯 Step 4/4: Clustering compressed vectors..."))
            .then_async(|text| async {
                let clusterer = VectorClusterer::new()?;
                with_progress_events_async(
                    app_handle.clone(),
                    "clustering_start", 
                    "clustering_complete",
                    || clusterer.cluster_compressed_vectors()
                ).await
                .map(|path| {
                    println!("✅ Compressed vectors clustered in: {}", path.display());
                    text
                })
            }).await
            .execute()?;

        // Emit final completion
        crate::utils::emit_completion(&app_handle, "all_jobs_complete")?;
        
        let session_manager = SessionManager::global();
        let session_dir = session_manager.get_session_dir();
        
        Ok(format!(
            "🎉 Complete font processing pipeline finished successfully!\n\
             📊 Results available in: {}\n\
             📝 Processed text: '{}'\n\
             ✅ All steps completed: Session → Images → Vectors → Compression → Clustering", 
            session_dir.display(), 
            processing_text
        ))
    }
    .await
    .map_err(|e: crate::error::FontError| format!("Pipeline failed: {}", e))
}