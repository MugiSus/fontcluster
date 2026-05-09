use crate::config::{
    AlgorithmConfig, ComputedData, FontData, FontMetadata, FontSet, ProcessStatus,
    ProcessingProgress, ProcessingStatus, ProgressSection, ProgressStage, SessionConfig,
};
use crate::error::Result;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Child;
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};
use uuid::Uuid;

#[derive(Clone)]
pub struct RunningJob {
    pub child: Arc<Mutex<Child>>,
    pub is_cancelled: Arc<AtomicBool>,
}

#[derive(Clone)]
pub struct AppState {
    pub current_session: Arc<Mutex<Option<SessionConfig>>>,
    pub current_job_children: Arc<Mutex<HashMap<String, RunningJob>>>,
    pub is_cancelled: Arc<AtomicBool>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            current_session: Arc::new(Mutex::new(None)),
            current_job_children: Arc::new(Mutex::new(HashMap::new())),
            is_cancelled: Arc::new(AtomicBool::new(false)),
        }
    }

    pub fn get_base_dir() -> Result<PathBuf> {
        dirs::data_dir()
            .map(|d| d.join("FontCluster"))
            .ok_or_else(|| crate::error::AppError::Io("AppData not found".into()))
    }

    pub fn get_session_dir(&self) -> Result<PathBuf> {
        let guard = self
            .current_session
            .lock()
            .map_err(|_| crate::error::AppError::Processing("Lock poisoned".into()))?;
        let session = guard
            .as_ref()
            .ok_or_else(|| crate::error::AppError::Processing("No active session".into()))?;
        let path = Self::get_base_dir()?
            .join("Generated")
            .join(&session.session_id);
        if !path.exists() {
            std::fs::create_dir_all(&path).map_err(|e| {
                crate::error::AppError::Io(format!(
                    "Failed to create session dir {}: {}",
                    path.display(),
                    e
                ))
            })?;
        }
        Ok(path)
    }

    pub fn initialize_session(
        &self,
        text: String,
        weights: Vec<i32>,
        algorithm: Option<AlgorithmConfig>,
    ) -> Result<String> {
        let id = Uuid::now_v7().to_string();
        let session = SessionConfig {
            app_version: env!("CARGO_PKG_VERSION").to_string(),
            modified_app_version: env!("CARGO_PKG_VERSION").to_string(),
            session_id: id.clone(),
            preview_text: text,
            created_at: chrono::Utc::now(),
            modified_at: chrono::Utc::now(),
            weights,
            discovered_fonts: HashMap::new(),
            algorithm,
            status: ProcessingStatus::default(),
        };

        let base_dir = Self::get_base_dir()?;
        let session_dir = base_dir.join("Generated").join(&id);
        fs::create_dir_all(&session_dir).map_err(|e| {
            crate::error::AppError::Io(format!(
                "Failed to create session dir {}: {}",
                session_dir.display(),
                e
            ))
        })?;

        let config_path = session_dir.join("config.json");
        fs::write(&config_path, serde_json::to_string_pretty(&session)?).map_err(|e| {
            crate::error::AppError::Io(format!(
                "Failed to write session config {}: {}",
                config_path.display(),
                e
            ))
        })?;

        let mut guard = self.current_session.lock().unwrap();
        *guard = Some(session);

        println!("🚀 New session initialized!");
        println!("📂 Session ID: {}", id);
        println!(
            "📍 Absolute Path: {}",
            session_dir.canonicalize().unwrap_or(session_dir).display()
        );

        Ok(id)
    }

    pub fn load_session(&self, id: &str) -> Result<()> {
        let session_dir = Self::get_base_dir()?.join("Generated").join(id);
        let config_path = session_dir.join("config.json");
        let mut session: SessionConfig =
            serde_json::from_str(&fs::read_to_string(&config_path).map_err(|e| {
                crate::error::AppError::Io(format!(
                    "Failed to read session config {}: {}",
                    config_path.display(),
                    e
                ))
            })?)?;
        refresh_session_progress(&mut session)?;
        self.save_session(&session)?;

        let mut guard = self.current_session.lock().unwrap();
        *guard = Some(session);
        Ok(())
    }

    pub fn update_status<F>(&self, f: F) -> Result<()>
    where
        F: FnOnce(&mut ProcessingStatus),
    {
        self.update_session(|session| {
            f(&mut session.status);
        })
    }

    pub fn update_session_config(
        &self,
        text: String,
        weights: Vec<i32>,
        algorithm: Option<AlgorithmConfig>,
        status: Option<ProcessStatus>,
    ) -> Result<()> {
        self.update_session(|session| {
            session.preview_text = text;
            session.weights = weights;
            if let Some(alg) = algorithm {
                session.algorithm = Some(alg);
            }
            if let Some(s) = status {
                session.status.process_status = s;
            }
        })
    }

    pub fn update_session<F>(&self, f: F) -> Result<()>
    where
        F: FnOnce(&mut SessionConfig),
    {
        let mut guard = self.current_session.lock().unwrap();
        if let Some(session) = guard.as_mut() {
            f(session);
            refresh_session_progress(session)?;
            session.modified_at = chrono::Utc::now();
            session.modified_app_version = env!("CARGO_PKG_VERSION").to_string();
            self.save_session(session)?;
        }
        Ok(())
    }

    pub fn update_progress<F>(&self, stage: ProgressStage, f: F) -> Result<()>
    where
        F: FnOnce(&mut ProgressSection),
    {
        let mut guard = self.current_session.lock().unwrap();
        if let Some(session) = guard.as_mut() {
            f(progress_section_mut(&mut session.status.progress, stage));
            self.save_session(session)?;
        }
        Ok(())
    }

    fn save_session(&self, session: &SessionConfig) -> Result<()> {
        let session_dir = Self::get_base_dir()?
            .join("Generated")
            .join(&session.session_id);
        let config_path = session_dir.join("config.json");
        fs::write(&config_path, serde_json::to_string_pretty(session)?).map_err(|e| {
            crate::error::AppError::Io(format!(
                "Failed to write session config {}: {}",
                config_path.display(),
                e
            ))
        })
    }
}

fn progress_section_mut(
    progress: &mut ProcessingProgress,
    stage: ProgressStage,
) -> &mut ProgressSection {
    match stage {
        ProgressStage::Download => &mut progress.download,
        ProgressStage::Discovery => &mut progress.discovery,
        ProgressStage::Generation => &mut progress.generation,
        ProgressStage::Vectorization => &mut progress.vectorization,
        ProgressStage::Analysis => &mut progress.analysis,
        ProgressStage::Position => &mut progress.position,
    }
}

pub fn refresh_session_progress(session: &mut SessionConfig) -> Result<()> {
    session.status.progress = compute_session_progress(session)?;
    Ok(())
}

pub fn compute_session_progress(session: &SessionConfig) -> Result<ProcessingProgress> {
    let session_dir = AppState::get_base_dir()?
        .join("Generated")
        .join(&session.session_id);

    let download_required = session
        .algorithm
        .as_ref()
        .and_then(|a| a.discovery.as_ref())
        .map(|d| !matches!(d.font_set, FontSet::SystemFonts))
        .unwrap_or(false);

    let downloaded_count =
        count_files_with_extensions(&session_dir.join("google_fonts"), &["ttf", "otf"]);
    let meta_count = count_sample_files(&session_dir, "meta.json");
    let image_count = count_sample_files(&session_dir, "sample.png");
    let vector_count = count_sample_files(&session_dir, "vector.bin");
    let (clustered_count, positioned_count) = count_analysis_outputs(&session_dir);

    let status = &session.status.process_status;
    let download_done = !download_required || status_at_least(status, &ProcessStatus::Downloaded);
    let discovery_done = status_at_least(status, &ProcessStatus::Discovered);
    let generation_done = status_at_least(status, &ProcessStatus::Generated);
    let vectorization_done = status_at_least(status, &ProcessStatus::Vectorized);
    let analysis_done = status_at_least(status, &ProcessStatus::Clustered);
    let position_done = status_at_least(status, &ProcessStatus::Positioned);

    let download = if download_required {
        progress_section(
            if download_done {
                downloaded_count.max(1)
            } else {
                downloaded_count
            },
            downloaded_count.max(1),
        )
    } else {
        progress_section(1, 1)
    };

    Ok(ProcessingProgress {
        download,
        discovery: progress_section(
            if discovery_done {
                meta_count.max(1)
            } else {
                meta_count
            },
            downloaded_count.max(meta_count).max(1),
        ),
        generation: progress_section(
            if generation_done {
                image_count.max(1)
            } else {
                image_count
            },
            meta_count.max(image_count).max(1),
        ),
        vectorization: progress_section(
            if vectorization_done {
                vector_count.max(1)
            } else {
                vector_count
            },
            image_count.max(vector_count).max(1),
        ),
        analysis: progress_section(
            if analysis_done {
                vector_count.max(1)
            } else {
                clustered_count
            },
            vector_count.max(1),
        ),
        position: progress_section(
            if position_done {
                vector_count.max(1)
            } else {
                positioned_count
            },
            vector_count.max(1),
        ),
    })
}

fn progress_section(numerator: usize, denominator: usize) -> ProgressSection {
    ProgressSection {
        numerator: numerator.min(denominator),
        denominator,
    }
}

fn status_at_least(current: &ProcessStatus, target: &ProcessStatus) -> bool {
    process_status_rank(current) >= process_status_rank(target)
}

fn process_status_rank(status: &ProcessStatus) -> usize {
    match status {
        ProcessStatus::Empty => 0,
        ProcessStatus::Downloaded => 1,
        ProcessStatus::Discovered => 2,
        ProcessStatus::Generated => 3,
        ProcessStatus::Vectorized => 4,
        ProcessStatus::Clustered => 5,
        ProcessStatus::Positioned => 6,
    }
}

fn count_sample_files(session_dir: &Path, file_name: &str) -> usize {
    let samples_dir = session_dir.join("samples");
    let Ok(entries) = fs::read_dir(samples_dir) else {
        return 0;
    };

    entries
        .filter_map(|entry| entry.ok())
        .filter(|entry| entry.path().is_dir())
        .filter(|entry| entry.path().join(file_name).exists())
        .count()
}

fn count_files_with_extensions(dir: &Path, extensions: &[&str]) -> usize {
    let Ok(entries) = fs::read_dir(dir) else {
        return 0;
    };

    entries
        .filter_map(|entry| entry.ok())
        .filter(|entry| {
            entry
                .path()
                .extension()
                .and_then(|ext| ext.to_str())
                .is_some_and(|ext| {
                    extensions
                        .iter()
                        .any(|candidate| ext.eq_ignore_ascii_case(candidate))
                })
        })
        .count()
}

fn count_analysis_outputs(session_dir: &Path) -> (usize, usize) {
    let samples_dir = session_dir.join("samples");
    let Ok(entries) = fs::read_dir(samples_dir) else {
        return (0, 0);
    };

    entries
        .filter_map(|entry| entry.ok())
        .filter(|entry| entry.path().is_dir())
        .filter_map(|entry| fs::read_to_string(entry.path().join("computed.json")).ok())
        .filter_map(|content| serde_json::from_str::<serde_json::Value>(&content).ok())
        .fold((0, 0), |(clustered, positioned), value| {
            (
                clustered + usize::from(value.get("clustering").is_some_and(|v| !v.is_null())),
                positioned + usize::from(value.get("positioning").is_some_and(|v| !v.is_null())),
            )
        })
}

pub fn save_font_metadata(session_dir: &Path, meta: &FontMetadata) -> Result<()> {
    let font_dir = session_dir.join("samples").join(&meta.safe_name);
    fs::create_dir_all(&font_dir).map_err(|e| {
        crate::error::AppError::Io(format!(
            "Failed to create font dir {}: {}",
            font_dir.display(),
            e
        ))
    })?;
    let meta_path = font_dir.join("meta.json");
    fs::write(&meta_path, serde_json::to_string_pretty(meta)?).map_err(|e| {
        crate::error::AppError::Io(format!(
            "Failed to save font metadata {}: {}",
            meta_path.display(),
            e
        ))
    })?;
    Ok(())
}

pub fn load_font_metadata(session_dir: &Path, safe_name: &str) -> Result<FontMetadata> {
    let path = session_dir
        .join("samples")
        .join(safe_name)
        .join("meta.json");
    Ok(serde_json::from_str(&fs::read_to_string(&path).map_err(
        |e| {
            crate::error::AppError::Io(format!(
                "Failed to load font metadata {}: {}",
                path.display(),
                e
            ))
        },
    )?)?)
}

pub fn save_computed_data(
    session_dir: &Path,
    safe_name: &str,
    computed: &ComputedData,
) -> Result<()> {
    let font_dir = session_dir.join("samples").join(safe_name);
    fs::create_dir_all(&font_dir).map_err(|e| {
        crate::error::AppError::Io(format!(
            "Failed to create font dir {}: {}",
            font_dir.display(),
            e
        ))
    })?;
    let computed_path = font_dir.join("computed.json");
    fs::write(&computed_path, serde_json::to_string_pretty(computed)?).map_err(|e| {
        crate::error::AppError::Io(format!(
            "Failed to save computed data {}: {}",
            computed_path.display(),
            e
        ))
    })?;
    Ok(())
}

pub fn load_computed_data(session_dir: &Path, safe_name: &str) -> Result<ComputedData> {
    let path = session_dir
        .join("samples")
        .join(safe_name)
        .join("computed.json");
    Ok(serde_json::from_str(&fs::read_to_string(&path).map_err(
        |e| {
            crate::error::AppError::Io(format!(
                "Failed to load computed data {}: {}",
                path.display(),
                e
            ))
        },
    )?)?)
}

pub fn load_font_data(session_dir: &Path, safe_name: &str) -> Result<FontData> {
    let meta = load_font_metadata(session_dir, safe_name)?;
    let computed = load_computed_data(session_dir, safe_name).ok();
    Ok(FontData { meta, computed })
}
