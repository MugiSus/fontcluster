use crate::core::{FontImageGenerator, VectorCompressor, VectorClusterer, SessionManager};
use crate::config::{FONT_SIZE, SessionData};
use crate::utils::{Pipeline, with_progress_events_async};
use tauri::{AppHandle, Emitter};

/// Single command to run all font processing jobs sequentially
/// 
/// This replaces the need for frontend to call multiple commands individually.
/// Each step emits completion events that the frontend can listen to for state updates.
#[tauri::command]
pub async fn run_jobs(text: Option<String>, weights: Option<Vec<i32>>, app_handle: AppHandle) -> Result<String, String> {
    async {
        let processing_text = text.unwrap_or_else(|| "Hamburgevons".to_string());
        let font_weights = weights.unwrap_or_else(|| vec![400]);
        println!("🚀 Starting complete font processing pipeline with text: '{}' and weights: {:?}", processing_text, font_weights);

        // Clean up old sessions before creating a new one (keep only 20 most recent)
        if let Err(e) = SessionManager::global().cleanup_old_sessions(19) {
            println!("Warning: Failed to cleanup old sessions: {}", e);
        } else {
            println!("🧹 Cleaned up old sessions (keeping 20 most recent)");
        }

        // Create functional pipeline
        let _result = Pipeline::new(processing_text.clone())
            .inspect(|text| println!("📂 Step 0/4: Creating new session for text: '{}'", text))
            .then(|text| {
                SessionManager::create_new_session_with_text_and_weights(text.clone(), font_weights.clone())
                    .map(|session_id| {
                        println!("✅ Session created: {}", session_id);
                        text
                    })
            })
            
            .inspect(|_| println!("🎨 Step 1/4: Generating font images..."))
            .then_async(|text| async {
                let generator = FontImageGenerator::new(Some(text.clone()), FONT_SIZE, font_weights.clone())?;
                with_progress_events_async(
                    app_handle.clone(),
                    "font_generation_start", 
                    "font_generation_complete",
                    || generator.generate_all(&app_handle)
                ).await
                .and_then(|path| {
                    println!("✅ Font images generated in: {}", path.display());
                    
                    // Update session config to mark images as completed
                    let session_manager = SessionManager::global();
                    let session_dir = session_manager.get_session_dir();
                    let mut config = SessionData::load_from_dir(&session_dir)?;
                    config.mark_images_completed(&session_dir)?;
                    
                    Ok(text)
                })
            }).await
            
            .inspect(|_| println!("🔢 Step 2/4: Skipping vectorization (vectors already generated in font rendering)..."))
            .then_async(|text| async {
                // Skip vectorization since vectors are now generated directly in font_renderer
                println!("✅ Font vectors already generated during rendering");
                
                // Update session config to mark vectors as completed
                let session_manager = SessionManager::global();
                let session_dir = session_manager.get_session_dir();
                let mut config = SessionData::load_from_dir(&session_dir)?;
                config.mark_vectors_completed(&session_dir)?;
                
                Ok(text)
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
                .and_then(|path| {
                    println!("✅ Vectors compressed to 2D in: {}", path.display());
                    
                    // Update session config to mark compression as completed
                    let session_manager = SessionManager::global();
                    let session_dir = session_manager.get_session_dir();
                    let mut config = SessionData::load_from_dir(&session_dir)?;
                    config.mark_compressed_completed(&session_dir)?;
                    
                    Ok(text)
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
                .and_then(|(path, cluster_size, sample_amount)| {
                    println!("✅ Compressed vectors clustered in: {}", path.display());
                    
                    // Update session config to mark clustering as completed and record metrics
                    let session_manager = SessionManager::global();
                    let session_dir = session_manager.get_session_dir();
                    let mut config = SessionData::load_from_dir(&session_dir)?;
                    config.mark_clusters_completed(&session_dir)?;
                    config.update_clusters_amount(&session_dir, cluster_size)?;
                    config.update_samples_amount(&session_dir, sample_amount)?;
                    
                    println!("📊 Recorded metrics: {} clusters, {} samples", cluster_size, sample_amount);
                    
                    Ok(text)
                })
            }).await
            .execute()?;

        // Emit final completion with session_id as payload
        let session_manager = SessionManager::global();
        let session_id = session_manager.get_session_id();
        let session_dir = session_manager.get_session_dir();
        
        // Emit completion with session_id payload for frontend
        if let Err(e) = app_handle.emit("all_jobs_complete", session_id) {
            println!("Warning: Failed to emit all_jobs_complete event: {}", e);
        }
        
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