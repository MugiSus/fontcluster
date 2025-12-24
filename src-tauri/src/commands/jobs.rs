use crate::core::{AppState, ImageGenerator, Vectorizer, Compressor, Clusterer};
use crate::config::AlgorithmConfig;
use crate::error::Result;
use tauri::{command, State, AppHandle, Emitter};

#[command]
pub async fn run_jobs(app: AppHandle, text: String, weights: Vec<i32>, algorithm: Option<AlgorithmConfig>, state: State<'_, AppState>) -> Result<String> {
    // Initialize session if not exists or if weights/text changed
    state.initialize_session(text, weights, algorithm)?;
    let id = {
        let guard = state.current_session.lock().unwrap();
        guard.as_ref().unwrap().id.clone()
    };

    // Step 1: Images
    app.emit("font_generation_start", ())?;
    let gen = ImageGenerator::new();
    gen.generate_all(&app, &state).await?;
    app.emit("font_generation_complete", id.clone())?;

    // Step 2: Vectors
    app.emit("vectorization_start", ())?;
    let vec = Vectorizer::new();
    vec.vectorize_all(&app, &state).await?;
    app.emit("vectorization_complete", id.clone())?;

    // Step 3: Compression
    app.emit("compression_start", ())?;
    Compressor::compress_all(&state).await?;
    app.emit("compression_complete", id.clone())?;

    // Step 4: Clustering
    app.emit("clustering_start", ())?;
    Clusterer::cluster_all(&state).await?;
    app.emit("clustering_complete", id.clone())?;

    app.emit("all_jobs_complete", id)?;

    Ok("Success".into())
}
