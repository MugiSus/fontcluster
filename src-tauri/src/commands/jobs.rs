//! Job orchestration: running the processing pipeline and reporting back.
//!
//! The pipeline runs in a **separate worker process** (the same executable
//! re-invoked with [`WORKER_RUN_JOBS_ARG`]) so a crash in native model code
//! can't take down the UI. This module has two sides:
//! - the app side ([`run_jobs`]/[`stop_jobs`]) spawns the worker, reads the
//!   JSON event lines it prints, and forwards them to the webview;
//! - the worker side ([`run_jobs_worker`]/[`run_jobs_pipeline`]) actually runs
//!   the discovery → render → analyse → cluster stages.

use crate::commands::progress::progress_events;
use crate::config::{
    AlgorithmConfig, AnalysisConfig, ClusteringConfig, FontSet, ProcessStatus, ProgressStage,
    RenderingConfig,
};
use crate::core::{
    clusterer, ensure_model, Analyzer, AppState, Discoverer, EventSink, GoogleFontsDownloader,
    RunningJob, SampleRenderer, StdoutEventSink,
};
use crate::error::{AppError, Result};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::io::{BufRead, BufReader};
use std::process::{Command, Stdio};
use std::sync::atomic::Ordering;
use std::sync::{Arc, Mutex};
use tauri::{command, AppHandle, Emitter, Manager, State};
use uuid::Uuid;

/// CLI flag that puts the executable into worker mode.
const WORKER_RUN_JOBS_ARG: &str = "--fontcluster-worker-run-jobs";
/// Upper bound on concurrently running job workers.
const MAX_RUNNING_JOBS: usize = 4;

/// Everything needed to start a pipeline run; serialised and passed to the
/// worker process on its command line.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunJobsRequest {
    pub algorithm: AlgorithmConfigPatch,
    pub session_id: Option<String>,
    pub override_status: Option<ProcessStatus>,
}

/// Partial algorithm config. The backend compares each supplied stage with the
/// persisted config and invalidates from the earliest changed stage.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AlgorithmConfigPatch {
    pub rendering: Option<RenderingConfig>,
    pub analysis: Option<AnalysisConfig>,
    pub clustering: Option<ClusteringConfig>,
}

/// Spawns a worker to run the pipeline and streams its events to the webview.
///
/// Rejects the call if too many jobs are already running, or if the target
/// session already has a job in flight. Returns the worker's final result
/// string (`"Success"`/`"Cancelled"`/…) once it exits.
#[command]
pub async fn run_jobs(
    app: AppHandle,
    algorithm: AlgorithmConfigPatch,
    session_id: Option<String>,
    override_status: Option<ProcessStatus>,
    state: State<'_, AppState>,
) -> Result<String> {
    let request = RunJobsRequest {
        algorithm,
        session_id,
        override_status,
    };
    let state = state.inner().clone();
    let run_id = Uuid::now_v7().to_string();
    {
        let running_jobs = state.current_job_children.lock().unwrap();
        if running_jobs.len() >= MAX_RUNNING_JOBS {
            return Err(AppError::Processing(format!(
                "The maximum of {MAX_RUNNING_JOBS} processing jobs is already running"
            )));
        }
        if let Some(session_id) = request.session_id.as_ref() {
            if running_jobs.contains_key(session_id) {
                return Err(AppError::Processing(
                    "This session already has a processing job running".into(),
                ));
            }
        }
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
        let is_cancelled = Arc::new(std::sync::atomic::AtomicBool::new(false));
        state.current_job_children.lock().unwrap().insert(
            run_id.clone(),
            RunningJob {
                child: child.clone(),
                is_cancelled: is_cancelled.clone(),
            },
        );

        let mut result = "Failed".to_string();
        let mut session_id: Option<String> = None;
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

            if message.event == "session_started" {
                if let Some(started_session_id) = message.payload.as_str() {
                    session_id = Some(started_session_id.to_string());
                    let mut running_jobs = state.current_job_children.lock().unwrap();
                    if let Some(job) = running_jobs.remove(&run_id) {
                        running_jobs.insert(started_session_id.to_string(), job);
                    }
                }
                app.emit(&message.event, message.payload)?;
                continue;
            }

            if message.event.starts_with("model_download_") {
                let mut payload = message.payload;
                if let (Some(session_id), Some(object)) =
                    (session_id.as_ref(), payload.as_object_mut())
                {
                    object.insert("sessionId".into(), Value::String(session_id.clone()));
                }
                app.emit(&message.event, payload)?;
                continue;
            }

            if is_progress_event(&message.event) {
                let payload = if let Some(session_id) = session_id.as_ref() {
                    json!({
                        "sessionId": session_id,
                        "value": message.payload,
                    })
                } else {
                    message.payload
                };
                app.emit(&message.event, payload)?;
                continue;
            }

            if message.event == "all_jobs_complete" {
                let key = session_id.as_ref().unwrap_or(&run_id).to_string();
                state.current_job_children.lock().unwrap().remove(&key);
                app.emit(&message.event, message.payload)?;
                continue;
            }

            app.emit(&message.event, message.payload)?;
        }

        let status = child.lock().unwrap().wait()?;
        let key = session_id.as_ref().unwrap_or(&run_id).to_string();
        state.current_job_children.lock().unwrap().remove(&key);
        if status.success() {
            Ok(result)
        } else if is_cancelled.load(Ordering::Relaxed) {
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

/// One JSON line as printed by the worker's [`StdoutEventSink`].
#[derive(Debug, Deserialize)]
struct WorkerEventMessage {
    event: String,
    payload: Value,
}

/// Progress stages a run starting from `status` will (re)compute, in pipeline
/// execution order (rendering → analysis → clustering).
///
/// Stages before the resume point are omitted so their already-complete
/// progress bars stay full while the downstream ones are cleared.
fn stages_to_reset(status: &ProcessStatus) -> &'static [ProgressStage] {
    use ProgressStage::{Analysis, Clustering, Rendering};
    match status {
        ProcessStatus::Empty => &[Rendering, Analysis, Clustering],
        ProcessStatus::Rendered => &[Analysis, Clustering],
        ProcessStatus::Analyzed => &[Clustering],
        ProcessStatus::Clustered => &[],
    }
}

/// True for the per-tick progress events, which are re-wrapped with the
/// session id before being forwarded to the webview.
fn is_progress_event(event: &str) -> bool {
    matches!(
        event,
        "progress_numerator_reset"
            | "progress_denominator_reset"
            | "progress_numerator_increase"
            | "progress_denominator_set"
            | "progress_denominator_decrease"
    )
}

/// True if `arg` is the flag that selects worker mode (checked in `main`).
pub fn is_worker_run_jobs_arg(arg: &str) -> bool {
    arg == WORKER_RUN_JOBS_ARG
}

/// Worker-process entry point: deserialises the request, runs the pipeline on
/// a single-threaded Tokio runtime, and prints the final result event.
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

/// Runs the full processing pipeline for one request.
///
/// Initialises or resumes the session, then advances it through the rendering,
/// analysis and clustering stages. Each stage is skipped if the
/// session's [`ProcessStatus`] already covers it, so an interrupted session
/// resumes where it left off. The session is packed into its document once it
/// reaches `Clustered`. Returns `"Cancelled"` if cancellation is observed at
/// any checkpoint, otherwise `"Success"`.
pub async fn run_jobs_pipeline(
    events: impl EventSink,
    state: &AppState,
    request: RunJobsRequest,
) -> Result<String> {
    state.is_cancelled.store(false, Ordering::Relaxed);

    // Initialize or load session
    let id = if let Some(sid) = request.session_id {
        state.load_session_for_processing(&sid)?;
        state.update_session_config(request.algorithm, request.override_status)?;
        sid
    } else {
        let rendering = request
            .algorithm
            .rendering
            .ok_or_else(|| AppError::Processing("Missing rendering config".into()))?;
        let analysis = request
            .algorithm
            .analysis
            .ok_or_else(|| AppError::Processing("Missing analysis config".into()))?;
        let clustering = request
            .algorithm
            .clustering
            .ok_or_else(|| AppError::Processing("Missing clustering config".into()))?;
        state.initialize_session(AlgorithmConfig {
            rendering,
            analysis,
            clustering,
        })?
    };
    events.emit_string("session_started", id.clone())?;

    // Model installation is job preparation rather than UI state. It happens
    // before rendering so network/integrity failures do not waste a render
    // pass, and the worker's process boundary keeps native inference isolated.
    let model_id = {
        let guard = state.current_session.lock().unwrap();
        guard.as_ref().unwrap().algorithm.analysis.model_id.clone()
    };
    // `ensure_model` owns a reqwest blocking client, filesystem lock, and
    // streamed file writes. Its complete lifecycle, including client drop,
    // must stay outside this async runtime.
    let model_install_id = model_id.clone();
    let model_install_events = events.clone();
    tokio::task::spawn_blocking(move || ensure_model(&model_install_id, &model_install_events))
        .await
        .map_err(|error| {
            AppError::Processing(format!("Model installation task failed: {error}"))
        })??;

    // When resuming from a midpoint, clear the progress of the resume stage and
    // every later stage so the UI stops showing stale results that are about to
    // be recomputed. Earlier stages keep their progress because their outputs
    // are reused as-is.
    let resume_status = {
        let guard = state.current_session.lock().unwrap();
        guard.as_ref().unwrap().status.process_status
    };
    for &stage in stages_to_reset(&resume_status) {
        progress_events::reset_progress(&events, state, stage);
    }

    // Step 0: Render samples
    let status = {
        let guard = state.current_session.lock().unwrap();
        guard.as_ref().unwrap().status.process_status
    };
    if status == ProcessStatus::Empty {
        if state.is_cancelled.load(Ordering::Relaxed) {
            return Ok("Cancelled".into());
        }
        state.reset_rendering_outputs()?;
        println!("🖼️ Starting sample rendering...");
        events.emit_unit("font_rendering_start")?;

        let font_set = {
            let guard = state.current_session.lock().unwrap();
            guard.as_ref().unwrap().algorithm.rendering.font_set.clone()
        };
        let disc = Discoverer::new();
        let google_fonts_dir = if matches!(font_set, FontSet::SystemFonts) {
            None
        } else {
            let temp_dir =
                tempfile::TempDir::new().map_err(|error| AppError::Io(error.to_string()))?;
            GoogleFontsDownloader::new()
                .download_fonts_to_dir(state, temp_dir.path().to_path_buf())
                .await?;
            Some(temp_dir)
        };

        let discovery = disc
            .discover_fonts(
                state,
                google_fonts_dir
                    .as_ref()
                    .map(|dir| dir.path().to_path_buf()),
            )
            .await?;

        if state.is_cancelled.load(Ordering::Relaxed) {
            return Ok("Cancelled".into());
        }
        let renderer = SampleRenderer::new();
        renderer
            .render_all(&events, state, discovery.render_sources)
            .await?;

        if state.is_cancelled.load(Ordering::Relaxed) {
            return Ok("Cancelled".into());
        }
        events.emit_string("font_rendering_complete", id.clone())?;
    }

    // Step 3: Vectors
    let status = {
        let guard = state.current_session.lock().unwrap();
        guard.as_ref().unwrap().status.process_status
    };
    if status == ProcessStatus::Rendered {
        if state.is_cancelled.load(Ordering::Relaxed) {
            return Ok("Cancelled".into());
        }
        println!("📐 Starting analysis...");
        events.emit_unit("analysis_start")?;
        let analyzer = Analyzer::new(&model_id)?;
        analyzer.analyze_all(&events, state).await?;

        if state.is_cancelled.load(Ordering::Relaxed) {
            return Ok("Cancelled".into());
        }
        events.emit_string("analysis_complete", id.clone())?;
    }

    // Step 4: Clustering
    let status = {
        let guard = state.current_session.lock().unwrap();
        guard.as_ref().unwrap().status.process_status
    };
    if status == ProcessStatus::Analyzed {
        if state.is_cancelled.load(Ordering::Relaxed) {
            return Ok("Cancelled".into());
        }
        println!("✨ Starting clustering...");
        events.emit_unit("clustering_start")?;
        clusterer::cluster_all(&events, state).await?;

        if state.is_cancelled.load(Ordering::Relaxed) {
            return Ok("Cancelled".into());
        }
        events.emit_string("clustering_complete", id.clone())?;
    }

    if state.is_cancelled.load(Ordering::Relaxed) {
        return Ok("Cancelled".into());
    }

    let final_status = {
        let guard = state.current_session.lock().unwrap();
        guard.as_ref().unwrap().status.process_status
    };
    if final_status != ProcessStatus::Clustered {
        return Err(AppError::Processing(format!(
            "Processing stopped before clustering completed (status: {final_status:?})"
        )));
    }
    state.finalize_session(&id)?;

    events.emit_string("all_jobs_complete", id)?;
    Ok("Success".into())
}

/// Cancels running jobs and kills their worker processes.
///
/// Cancels the worker for `session_id` if given, otherwise every running
/// worker. Each job's cancellation flag is set before the process is killed so
/// it can report `"Cancelled"` cleanly, and `jobs_cancelled` is emitted.
#[command]
pub fn stop_jobs(
    app: AppHandle,
    state: State<'_, AppState>,
    session_id: Option<String>,
) -> Result<()> {
    let jobs = {
        let mut running_jobs = state.current_job_children.lock().unwrap();
        match session_id.as_ref() {
            Some(session_id) => running_jobs
                .remove(session_id)
                .into_iter()
                .collect::<Vec<_>>(),
            None => running_jobs.drain().map(|(_, job)| job).collect::<Vec<_>>(),
        }
    };

    for job in jobs {
        job.is_cancelled.store(true, Ordering::Relaxed);
        let _ = job.child.lock().unwrap().kill();
    }
    app.emit("jobs_cancelled", session_id)?;
    Ok(())
}
