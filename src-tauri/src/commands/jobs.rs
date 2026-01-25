use crate::core::{AppState, Discoverer, ImageGenerator, Vectorizer, Compressor, Clusterer};
use crate::config::{AlgorithmConfig, ProcessStatus};
use crate::error::Result;
use tauri::{command, State, AppHandle, Emitter};
use std::sync::atomic::Ordering;

#[command]
pub async fn run_jobs(app: AppHandle, text: String, weights: Vec<i32>, algorithm: Option<AlgorithmConfig>, session_id: Option<String>, override_status: Option<ProcessStatus>, state: State<'_, AppState>) -> Result<String> {
    state.is_cancelled.store(false, Ordering::Relaxed);

    // Initialize or load session
    let id = if let Some(sid) = session_id {
        state.load_session(&sid)?;
        state.update_session_config(algorithm, override_status)?;
        sid
    } else {
        state.initialize_session(text, weights, algorithm)?
    };

    // Step 0: Discovery
    let status = {
        let guard = state.current_session.lock().unwrap();
        guard.as_ref().unwrap().status.process_status.clone()
    };
    if status == ProcessStatus::Empty {
        if state.is_cancelled.load(Ordering::Relaxed) { return Ok("Cancelled".into()); }
        println!("🔍 Starting discovery...");
        app.emit("discovery_start", ())?;
        let disc = Discoverer::new();
        disc.discover_fonts(&app, &state).await?;
        
        if state.is_cancelled.load(Ordering::Relaxed) { return Ok("Cancelled".into()); }
        app.emit("discovery_complete", id.clone())?;
    }

    // Step 1: Images
    let status = {
        let guard = state.current_session.lock().unwrap();
        guard.as_ref().unwrap().status.process_status.clone()
    };
    if status == ProcessStatus::Discovered {
        if state.is_cancelled.load(Ordering::Relaxed) { return Ok("Cancelled".into()); }
        println!("🖼️ Starting image generation...");
        app.emit("font_generation_start", ())?;
        let gen = ImageGenerator::new();
        gen.generate_all(&app, &state).await?;

        if state.is_cancelled.load(Ordering::Relaxed) { return Ok("Cancelled".into()); }
        app.emit("font_generation_complete", id.clone())?;
    }

    // Step 2: Vectors
    let status = {
        let guard = state.current_session.lock().unwrap();
        guard.as_ref().unwrap().status.process_status.clone()
    };
    if status == ProcessStatus::Generated {
        if state.is_cancelled.load(Ordering::Relaxed) { return Ok("Cancelled".into()); }
        println!("📐 Starting vectorization...");
        app.emit("vectorization_start", ())?;
        let vec = Vectorizer::new();
        vec.vectorize_all(&app, &state).await?;

        if state.is_cancelled.load(Ordering::Relaxed) { return Ok("Cancelled".into()); }
        app.emit("vectorization_complete", id.clone())?;
    }

    // Step 3: Compression
    let status = {
        let guard = state.current_session.lock().unwrap();
        guard.as_ref().unwrap().status.process_status.clone()
    };
    if status == ProcessStatus::Vectorized {
        if state.is_cancelled.load(Ordering::Relaxed) { return Ok("Cancelled".into()); }
        println!("📦 Starting compression...");
        app.emit("compression_start", ())?;
        Compressor::compress_all(&state).await?;

        if state.is_cancelled.load(Ordering::Relaxed) { return Ok("Cancelled".into()); }
        app.emit("compression_complete", id.clone())?;
    }

    // Step 4: Clustering
    let status = {
        let guard = state.current_session.lock().unwrap();
        guard.as_ref().unwrap().status.process_status.clone()
    };
    if status == ProcessStatus::Compressed {
        if state.is_cancelled.load(Ordering::Relaxed) { return Ok("Cancelled".into()); }
        println!("✨ Starting clustering...");
        app.emit("clustering_start", ())?;
        Clusterer::cluster_all(&state).await?;
        app.emit("clustering_complete", id.clone())?;
    }

    if state.is_cancelled.load(Ordering::Relaxed) {
        Ok("Cancelled".into())
    } else {
        app.emit("all_jobs_complete", id)?;
        Ok("Success".into())
    }
}

#[command]
pub fn stop_jobs(state: State<'_, AppState>) -> Result<()> {
    state.is_cancelled.store(true, Ordering::Relaxed);
    Ok(())
}
