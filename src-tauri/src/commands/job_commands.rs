use crate::core::{FontImageGenerator, FontImageVectorizer, VectorCompressor, VectorClusterer, SessionManager};
use crate::config::FONT_SIZE;
use tauri::Emitter;

/// Single command to run all font processing jobs sequentially
/// 
/// This replaces the need for frontend to call multiple commands individually.
/// Each step emits completion events that the frontend can listen to for state updates.
#[tauri::command]
pub async fn run_jobs(text: Option<String>, app_handle: tauri::AppHandle) -> Result<String, String> {
    let processing_text = text.unwrap_or_else(|| "A quick brown fox jumps over the lazy dog".to_string());
    
    println!("🚀 Starting complete font processing pipeline with text: '{}'", processing_text);
    
    // Step 0: Create new session
    println!("📂 Step 0/4: Creating new session...");
    let session_result = crate::commands::session_commands::create_new_session()
        .map_err(|e| format!("Session creation failed: {}", e))?;
    println!("✅ Session created: {}", session_result);

    // Step 1: Generate font images
    println!("🎨 Step 1/4: Generating font images...");
    let generator = FontImageGenerator::new(Some(processing_text.clone()), FONT_SIZE)
        .map_err(|e| format!("Failed to initialize generator: {}", e))?;
    
    let image_result = generator.generate_all().await
        .map(|output_dir| {
            app_handle.emit("font_generation_complete", ())
                .unwrap_or_else(|e| eprintln!("Failed to emit completion event: {}", e));
            format!("Font images generated in: {}", output_dir.display())
        })
        .map_err(|e| format!("Font generation failed: {}", e))?;
    println!("✅ {}", image_result);

    // Step 2: Vectorize images
    println!("🔢 Step 2/4: Vectorizing font images...");
    let vectorizer = FontImageVectorizer::new()
        .map_err(|e| format!("Failed to initialize vectorizer: {}", e))?;
    
    let vector_result = vectorizer.vectorize_all().await
        .map(|output_dir| {
            app_handle.emit("vectorization_complete", ())
                .unwrap_or_else(|e| eprintln!("Failed to emit vectorization completion event: {}", e));
            format!("Font images vectorized in: {}", output_dir.display())
        })
        .map_err(|e| format!("Vectorization failed: {}", e))?;
    println!("✅ {}", vector_result);

    // Step 3: Compress vectors to 2D
    println!("📐 Step 3/4: Compressing vectors to 2D...");
    let compressor = VectorCompressor::new()
        .map_err(|e| format!("Failed to initialize compressor: {}", e))?;
    
    let compression_result = compressor.compress_all().await
        .map(|output_dir| {
            app_handle.emit("compression_complete", ())
                .unwrap_or_else(|e| eprintln!("Failed to emit compression completion event: {}", e));
            format!("Vectors compressed to 2D in: {}", output_dir.display())
        })
        .map_err(|e| format!("Vector compression failed: {}", e))?;
    println!("✅ {}", compression_result);

    // Step 4: Cluster compressed vectors
    println!("🎯 Step 4/4: Clustering compressed vectors...");
    let clusterer = VectorClusterer::new()
        .map_err(|e| format!("Failed to initialize clusterer: {}", e))?;
    
    let clustering_result = clusterer.cluster_compressed_vectors().await
        .map(|output_dir| {
            app_handle.emit("clustering_complete", ())
                .unwrap_or_else(|e| eprintln!("Failed to emit clustering completion event: {}", e));
            format!("Compressed vectors clustered in: {}", output_dir.display())
        })
        .map_err(|e| format!("Vector clustering failed: {}", e))?;
    println!("✅ {}", clustering_result);

    // Emit final completion event
    app_handle.emit("all_jobs_complete", ())
        .unwrap_or_else(|e| eprintln!("Failed to emit final completion event: {}", e));

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