use crate::config::{AlgorithmConfig, ProcessStatus};
use crate::core::{
    AppState, Clusterer, Discoverer, EventSink, GoogleFontsDownloader, ImageGenerator, Positioner,
    StdoutEventSink, Vectorizer,
};
use crate::error::{AppError, Result};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::io::{BufRead, BufReader};
use std::process::{Command, Stdio};
use std::sync::atomic::Ordering;
use std::sync::{Arc, Mutex};
use tauri::{command, AppHandle, Emitter, Manager, State};

const WORKER_RUN_JOBS_ARG: &str = "--fontcluster-worker-run-jobs";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunJobsRequest {
    pub text: String,
    pub weights: Vec<i32>,
    pub algorithm: Option<AlgorithmConfig>,
    pub session_id: Option<String>,
    pub override_status: Option<ProcessStatus>,
}

#[command]
pub async fn run_jobs(
    app: AppHandle,
    text: String,
    weights: Vec<i32>,
    algorithm: Option<AlgorithmConfig>,
    session_id: Option<String>,
    override_status: Option<ProcessStatus>,
    state: State<'_, AppState>,
) -> Result<String> {
    let request = RunJobsRequest {
        text,
        weights,
        algorithm,
        session_id,
        override_status,
    };
    run_jobs_in_worker(app, state.inner().clone(), request).await
}

async fn run_jobs_in_worker(
    app: AppHandle,
    state: AppState,
    request: RunJobsRequest,
) -> Result<String> {
    state.is_cancelled.store(false, Ordering::Relaxed);
    if state.current_job_child.lock().unwrap().is_some() {
        return Err(AppError::Processing(
            "A processing job is already running".into(),
        ));
    }

    let request_json = serde_json::to_string(&request)?;
    let resource_dir = app.path().resource_dir().ok();

    tokio::task::spawn_blocking(move || -> Result<String> {
        let mut command = Command::new(std::env::current_exe()?);
        command
            .arg(WORKER_RUN_JOBS_ARG)
            .arg(request_json)
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit());

        if let Some(resource_dir) = resource_dir {
            command.env("FONTCLUSTER_RESOURCE_DIR", resource_dir);
        }

        let mut child = command.spawn().map_err(|error| {
            AppError::Processing(format!("Failed to spawn job worker process: {error}"))
        })?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| AppError::Processing("Worker stdout was not piped".into()))?;
        let child = Arc::new(Mutex::new(child));
        *state.current_job_child.lock().unwrap() = Some(child.clone());

        let mut result = "Failed".to_string();
        for line in BufReader::new(stdout).lines() {
            let line = line?;
            let Ok(message) = serde_json::from_str::<WorkerEventMessage>(&line) else {
                println!("{line}");
                continue;
            };

            if message.event == "worker_result" {
                if let Some(value) = message.payload.as_str() {
                    result = value.to_string();
                }
                continue;
            }

            app.emit(&message.event, message.payload)?;
        }

        let status = child.lock().unwrap().wait()?;
        *state.current_job_child.lock().unwrap() = None;
        if status.success() {
            Ok(result)
        } else if state.is_cancelled.load(Ordering::Relaxed) {
            Ok("Cancelled".into())
        } else {
            Err(AppError::Processing(format!(
                "Job worker exited with status {status}"
            )))
        }
    })
    .await
    .map_err(|error| AppError::Processing(error.to_string()))?
}

#[derive(Debug, Deserialize)]
struct WorkerEventMessage {
    event: String,
    payload: Value,
}

pub fn is_worker_run_jobs_arg(arg: &str) -> bool {
    arg == WORKER_RUN_JOBS_ARG
}

pub fn run_jobs_worker(request_json: &str) -> Result<()> {
    let request = serde_json::from_str::<RunJobsRequest>(request_json)?;
    let state = AppState::new();
    let events = StdoutEventSink::new();
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .map_err(|error| AppError::Processing(error.to_string()))?;
    let result = runtime.block_on(run_jobs_pipeline(events.clone(), &state, request))?;
    events.emit_string("worker_result", result)?;
    Ok(())
}

pub async fn run_jobs_pipeline(
    events: impl EventSink,
    state: &AppState,
    request: RunJobsRequest,
) -> Result<String> {
    state.is_cancelled.store(false, Ordering::Relaxed);

    // Initialize or load session
    let id = if let Some(sid) = request.session_id {
        state.load_session(&sid)?;
        state.update_session_config(
            request.text,
            request.weights,
            request.algorithm,
            request.override_status,
        )?;
        sid
    } else {
        state.initialize_session(request.text, request.weights, request.algorithm)?
    };
    events.emit_string("session_started", id.clone())?;

    // Step 0: Download Google Fonts
    let status = {
        let guard = state.current_session.lock().unwrap();
        guard.as_ref().unwrap().status.process_status.clone()
    };
    if status == ProcessStatus::Empty && GoogleFontsDownloader::should_run(&state)? {
        if state.is_cancelled.load(Ordering::Relaxed) {
            return Ok("Cancelled".into());
        }
        println!("⬇️ Starting Google Fonts download...");
        events.emit_unit("download_start")?;
        let downloader = GoogleFontsDownloader::new();
        downloader.download_fonts(&events, state).await?;

        if state.is_cancelled.load(Ordering::Relaxed) {
            return Ok("Cancelled".into());
        }
        state.update_status(|s| s.process_status = ProcessStatus::Downloaded)?;
        events.emit_string("download_complete", id.clone())?;
    }

    // Step 1: Discovery
    let status = {
        let guard = state.current_session.lock().unwrap();
        guard.as_ref().unwrap().status.process_status.clone()
    };
    if status == ProcessStatus::Empty || status == ProcessStatus::Downloaded {
        if state.is_cancelled.load(Ordering::Relaxed) {
            return Ok("Cancelled".into());
        }
        println!("🔍 Starting discovery...");
        events.emit_unit("discovery_start")?;
        let disc = Discoverer::new();
        disc.discover_fonts(&events, state).await?;

        if state.is_cancelled.load(Ordering::Relaxed) {
            return Ok("Cancelled".into());
        }
        state.update_status(|s| s.process_status = ProcessStatus::Discovered)?;
        events.emit_string("discovery_complete", id.clone())?;
    }

    // Step 2: Images
    let status = {
        let guard = state.current_session.lock().unwrap();
        guard.as_ref().unwrap().status.process_status.clone()
    };
    if status == ProcessStatus::Discovered {
        if state.is_cancelled.load(Ordering::Relaxed) {
            return Ok("Cancelled".into());
        }
        println!("🖼️ Starting image generation...");
        events.emit_unit("font_generation_start")?;
        let gen = ImageGenerator::new();
        gen.generate_all(&events, state).await?;

        if state.is_cancelled.load(Ordering::Relaxed) {
            return Ok("Cancelled".into());
        }
        events.emit_string("font_generation_complete", id.clone())?;
    }

    // Step 3: Vectors
    let status = {
        let guard = state.current_session.lock().unwrap();
        guard.as_ref().unwrap().status.process_status.clone()
    };
    if status == ProcessStatus::Generated {
        if state.is_cancelled.load(Ordering::Relaxed) {
            return Ok("Cancelled".into());
        }
        println!("📐 Starting vectorization...");
        events.emit_unit("vectorization_start")?;
        let vec = Vectorizer::new()?;
        vec.vectorize_all(&events, state).await?;

        if state.is_cancelled.load(Ordering::Relaxed) {
            return Ok("Cancelled".into());
        }
        events.emit_string("vectorization_complete", id.clone())?;
    }

    // Step 4: Clustering
    let status = {
        let guard = state.current_session.lock().unwrap();
        guard.as_ref().unwrap().status.process_status.clone()
    };
    if status == ProcessStatus::Vectorized {
        if state.is_cancelled.load(Ordering::Relaxed) {
            return Ok("Cancelled".into());
        }
        println!("✨ Starting clustering...");
        events.emit_unit("clustering_start")?;
        Clusterer::cluster_all(state).await?;

        if state.is_cancelled.load(Ordering::Relaxed) {
            return Ok("Cancelled".into());
        }
        events.emit_string("clustering_complete", id.clone())?;
    }

    // Step 5: Positioning
    let status = {
        let guard = state.current_session.lock().unwrap();
        guard.as_ref().unwrap().status.process_status.clone()
    };
    if status == ProcessStatus::Clustered {
        if state.is_cancelled.load(Ordering::Relaxed) {
            return Ok("Cancelled".into());
        }
        println!("📍 Starting positioning...");
        events.emit_unit("positioning_start")?;
        Positioner::position_all(state).await?;
        events.emit_string("positioning_complete", id.clone())?;
    }

    if state.is_cancelled.load(Ordering::Relaxed) {
        Ok("Cancelled".into())
    } else {
        events.emit_string("all_jobs_complete", id)?;
        Ok("Success".into())
    }
}

#[command]
pub fn stop_jobs(app: AppHandle, state: State<'_, AppState>) -> Result<()> {
    state.is_cancelled.store(true, Ordering::Relaxed);
    if let Some(child) = state.current_job_child.lock().unwrap().as_ref() {
        let _ = child.lock().unwrap().kill();
    }
    app.emit("jobs_cancelled", ())?;
    Ok(())
}
