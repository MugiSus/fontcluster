use crate::core::SessionManager;
use crate::config::{FontConfig, ComputedData};
use crate::error::{FontResult, FontError};
use std::path::PathBuf;
use std::fs;
use tokio::task;
use futures::future::join_all;
use ndarray::Array2;
use pacmap::{Configuration, fit_transform, Initialization};
use bytemuck;

// Vector compression service
pub struct VectorCompressor;

impl VectorCompressor {
    pub fn new() -> FontResult<Self> {
        Ok(Self)
    }
    
    pub async fn compress_all(&self) -> FontResult<PathBuf> {
        let vector_files = self.get_vector_files()?;
        println!("Found {} vector files to compress", vector_files.len());
        
        if vector_files.is_empty() {
            return Err(FontError::Vectorization("No vector files found".to_string()));
        }
        
        // Read all vectors in parallel
        println!("Starting parallel vector file reading for {} files...", vector_files.len());
        let vector_tasks: Vec<_> = vector_files.into_iter()
            .filter_map(|vector_path| {
                // Extract font name from path: Generated/session_id/font_name/vector.bin
                vector_path.parent()
                    .and_then(|parent| parent.file_name())
                    .and_then(|name| name.to_str())
                    .map(|font_name| {
                        let font_name = font_name.to_string();
                        let path = vector_path.clone();
                        task::spawn_blocking(move || {
                            match VectorCompressor::read_vector_file_static(&path) {
                                Ok(vector) => {
                                    println!("✓ Vector file '{}' loaded successfully ({} dimensions)", font_name, vector.len());
                                    Some((font_name, vector))
                                },
                                Err(e) => {
                                    eprintln!("Failed to read vector file {}: {}", path.display(), e);
                                    None
                                }
                            }
                        })
                    })
            })
            .collect();

        let results = join_all(vector_tasks).await;
        println!("Completed parallel vector file reading, processing results...");
        
        let (font_names, vectors): (Vec<_>, Vec<_>) = results
            .into_iter()
            .filter_map(|task_result| match task_result {
                Ok(Some((name, vector))) => Some((name, vector)),
                Ok(None) => None, // File read failed, already logged
                Err(e) => {
                    eprintln!("Task execution failed: {}", e);
                    None
                }
            })
            .unzip();
        
        if vectors.is_empty() {
            return Err(FontError::Vectorization("No valid vectors found".to_string()));
        }
        
        println!("Successfully loaded {} vectors, starting PaCMAP compression...", vectors.len());
        
        // Perform PaCMAP compression (now includes parallel file saving)
        Self::compress_vectors_to_2d(&vectors, &font_names).await?;
        
        // Delete vector.bin files after successful compression
        Self::cleanup_vector_files().await?;
        
        println!("PaCMAP compression completed successfully!");
        Ok(SessionManager::global().get_session_dir())
    }
    
    fn get_vector_files(&self) -> FontResult<Vec<PathBuf>> {
        let session_manager = SessionManager::global();
        let session_dir = session_manager.get_session_dir();
        
        Ok(fs::read_dir(&session_dir)?
            .filter_map(|entry| entry.ok())
            .filter(|entry| entry.path().is_dir())
            .filter_map(|entry| {
                let font_dir = entry.path();
                let vector_path = font_dir.join("vector.bin");
                if vector_path.exists() {
                    Some(vector_path)
                } else {
                    None
                }
            })
            .collect())
    }
    
    fn read_vector_file_static(path: &PathBuf) -> FontResult<Vec<f32>> {
        let bytes = fs::read(path)
            .map_err(|e| FontError::Vectorization(format!("Failed to read vector file: {}", e)))?;
        
        // Convert bytes back to f32 slice using bytemuck
        let floats = bytemuck::cast_slice(&bytes).to_vec();
        Ok(floats)
    }

    async fn compress_vectors_to_2d(vectors: &[Vec<f32>], font_names: &[String]) -> FontResult<()> {
        if vectors.is_empty() || vectors[0].is_empty() {
            return Err(FontError::Vectorization("No valid vectors to compress".to_string()));
        }
        
        let n_samples = vectors.len();
        let n_features = vectors[0].len();
        
        println!("Preparing matrix data: {} samples x {} features", n_samples, n_features);
        
        // Create ndarray from vectors for PaCMAP (rows are samples, columns are features)
        let matrix_data: Vec<f32> = vectors
            .iter()
            .flat_map(|vector| vector.iter().cloned())
            .collect();
        
        let data_matrix = Array2::from_shape_vec((n_samples, n_features), matrix_data)
            .map_err(|e| FontError::Vectorization(format!("Failed to create data matrix: {}", e)))?;
        
        println!("Matrix created, configuring PaCMAP...");
        
        // Configure PaCMAP to preserve outlier positions while maintaining structure
        let config = Configuration::builder()
            .embedding_dimensions(2)
            .initialization(Initialization::Random(Some(42)))
            .num_iters((200, 100, 400)) // More neighbor pairs for local structure preservation
            .learning_rate(1.0) // Lower learning rate for stable positioning
            .mid_near_ratio(0.8) // Balanced mid-range emphasis
            .far_pair_ratio(1.0)
            .override_neighbors(40) // Higher ratio to prevent extreme outlier separation
            .build();
        
        println!("Data prepared, running PaCMAP dimensionality reduction...");
        
        // Run PaCMAP compression in a blocking task since it's CPU intensive
        let embedding_result = task::spawn_blocking(move || {
            fit_transform(data_matrix.view(), config)
        }).await
        .map_err(|e| FontError::Vectorization(format!("PaCMAP task failed: {}", e)))?
        .map_err(|e| FontError::Vectorization(format!("PaCMAP computation failed: {}", e)))?;
        
        let (embedding, _) = embedding_result;
        
        println!("PaCMAP completed, saving compressed vectors...");
        
        // Save compressed vectors to config.json
        println!("Creating {} parallel save tasks...", font_names.len());
        let save_tasks: Vec<_> = font_names.iter().enumerate().map(|(i, font_name)| {
            let x = embedding[[i, 0]];
            let y = if embedding.ncols() > 1 { embedding[[i, 1]] } else { 0.0 };
            let font_name = font_name.clone();
            task::spawn_blocking(move || {
                let session_manager = SessionManager::global();
                let font_dir = session_manager.get_font_directory(&font_name);
                let config_path = font_dir.join("config.json");
                
                // Load existing font config
                let mut font_config: FontConfig = if config_path.exists() {
                    let config_str = fs::read_to_string(&config_path)
                        .map_err(|e| FontError::Vectorization(format!("Failed to read font config: {}", e)))?;
                    serde_json::from_str(&config_str)
                        .map_err(|e| FontError::Vectorization(format!("Failed to parse font config: {}", e)))?
                } else {
                    return Err(FontError::Vectorization(format!("Font config not found for: {}", font_name)));
                };
                
                // Update computed data (k will be set later by clustering)
                font_config.computed = Some(ComputedData {
                    vector: vec![x, y],
                    k: -1, // Placeholder, will be updated by clustering
                });
                
                // Save updated config
                let config_json = serde_json::to_string_pretty(&font_config)
                    .map_err(|e| FontError::Vectorization(format!("Failed to serialize font config: {}", e)))?;
                
                fs::write(&config_path, config_json)
                    .map_err(|e| FontError::Vectorization(format!("Failed to write font config: {}", e)))?;
                
                println!("✓ Compressed vector for '{}' saved to config.json: ({:.3}, {:.3})", font_name, x, y);
                Ok(())
            })
        }).collect();
        
        // Wait for all save tasks to complete
        let save_results = join_all(save_tasks).await;
        println!("Parallel save tasks completed, checking results...");
        
        // Check for any errors in saving
        save_results
            .into_iter()
            .enumerate()
            .try_for_each(|(i, result)| match result {
                Ok(Ok(())) => Ok(()),
                Ok(Err(e)) => Err(e),
                Err(e) => Err(FontError::Vectorization(format!("Save task {} failed: {}", i, e))),
            })?;
        
        println!("Compressed {} vectors to 2D using PaCMAP", font_names.len());
        Ok(())
    }

    async fn cleanup_vector_files() -> FontResult<()> {
        let session_manager = SessionManager::global();
        let session_dir = session_manager.get_session_dir();
        
        let vector_files: Vec<PathBuf> = fs::read_dir(&session_dir)?
            .filter_map(|entry| entry.ok())
            .filter(|entry| entry.path().is_dir())
            .filter_map(|entry| {
                let font_dir = entry.path();
                let vector_path = font_dir.join("vector.bin");
                if vector_path.exists() {
                    Some(vector_path)
                } else {
                    None
                }
            })
            .collect();

        if vector_files.is_empty() {
            return Ok(());
        }

        println!("Cleaning up {} vector.bin files after compression...", vector_files.len());
        
        // Delete vector.bin files in parallel
        let cleanup_tasks: Vec<_> = vector_files.into_iter().map(|vector_path| {
            task::spawn_blocking(move || {
                match fs::remove_file(&vector_path) {
                    Ok(_) => {
                        println!("✓ Deleted vector.bin: {}", vector_path.display());
                        Ok(())
                    },
                    Err(e) => {
                        eprintln!("Failed to delete vector.bin {}: {}", vector_path.display(), e);
                        Err(FontError::Io(e))
                    }
                }
            })
        }).collect();

        let cleanup_results = join_all(cleanup_tasks).await;
        
        // Check for any errors in cleanup
        cleanup_results
            .into_iter()
            .try_for_each(|result| match result {
                Ok(Ok(())) => Ok(()),
                Ok(Err(e)) => Err(e),
                Err(e) => Err(FontError::Vectorization(format!("Cleanup task failed: {}", e))),
            })?;

        println!("Successfully cleaned up all vector.bin files");
        Ok(())
    }
}