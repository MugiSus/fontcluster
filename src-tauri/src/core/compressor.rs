use crate::core::FontService;
use crate::error::{FontResult, FontError};
use std::path::PathBuf;
use std::fs;
use tokio::task;
use futures::future::join_all;
use nalgebra::DMatrix;
use std::io::Write;

// Vector compression service
pub struct VectorCompressor {
    vector_dir: PathBuf,
    comp_vector_dir: PathBuf,
}

impl VectorCompressor {
    pub fn new() -> FontResult<Self> {
        let vector_dir = FontService::get_vectors_directory()?;
        let comp_vector_dir = FontService::get_compressed_vectors_directory()?;
        Ok(Self { vector_dir, comp_vector_dir })
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
                vector_path.file_stem()
                    .and_then(|s| s.to_str())
                    .map(|stem| {
                        let stem = stem.to_string();
                        let path = vector_path.clone();
                        task::spawn_blocking(move || {
                            match VectorCompressor::read_vector_file_static(&path) {
                                Ok(vector) => {
                                    println!("✓ Vector file '{}' loaded successfully ({} dimensions)", stem, vector.len());
                                    Some((stem, vector))
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
        let mut vectors = Vec::new();
        let mut font_names = Vec::new();
        
        for task_result in results {
            match task_result {
                Ok(Some((name, vector))) => {
                    font_names.push(name);
                    vectors.push(vector);
                }
                Ok(None) => {} // File read failed, already logged
                Err(e) => eprintln!("Task execution failed: {}", e),
            }
        }
        
        if vectors.is_empty() {
            return Err(FontError::Vectorization("No valid vectors found".to_string()));
        }
        
        println!("Successfully loaded {} vectors, starting PCA compression...", vectors.len());
        
        // Perform PCA compression (now includes parallel file saving)
        let comp_vector_dir = self.comp_vector_dir.clone();
        Self::compress_vectors_to_2d(&vectors, &font_names, &comp_vector_dir).await?;
        
        println!("PCA compression completed successfully!");
        Ok(self.comp_vector_dir.clone())
    }
    
    fn get_vector_files(&self) -> FontResult<Vec<PathBuf>> {
        let mut vector_files = Vec::new();
        
        for entry in fs::read_dir(&self.vector_dir)? {
            let entry = entry?;
            let path = entry.path();
            
            if path.extension().and_then(|ext| ext.to_str()) == Some("csv") {
                vector_files.push(path);
            }
        }
        
        Ok(vector_files)
    }
    
    fn read_vector_file_static(path: &PathBuf) -> FontResult<Vec<f32>> {
        let content = fs::read_to_string(path)
            .map_err(|e| FontError::Vectorization(format!("Failed to read vector file: {}", e)))?;
        
        let values: Result<Vec<f32>, _> = content.trim().split(',')
            .map(|s| s.parse::<f32>())
            .collect();
        
        values.map_err(|e| FontError::Vectorization(format!("Failed to parse vector values: {}", e)))
    }

    async fn compress_vectors_to_2d(vectors: &[Vec<f32>], font_names: &[String], comp_vector_dir: &PathBuf) -> FontResult<()> {
        if vectors.is_empty() || vectors[0].is_empty() {
            return Err(FontError::Vectorization("No valid vectors to compress".to_string()));
        }
        
        let n_samples = vectors.len();
        let n_features = vectors[0].len();
        
        println!("Preparing matrix data: {} samples x {} features", n_samples, n_features);
        
        // Create matrix from vectors (rows are samples, columns are features)
        let mut matrix_data = Vec::with_capacity(n_samples * n_features);
        for vector in vectors {
            for &value in vector {
                matrix_data.push(value as f64);
            }
        }
        
        let matrix = DMatrix::from_row_slice(n_samples, n_features, &matrix_data);
        
        println!("Matrix created, centering data...");
        // Center the data (subtract column means)
        let mut col_means = Vec::with_capacity(n_features);
        for col in 0..n_features {
            let col_sum: f64 = (0..n_samples).map(|row| matrix[(row, col)]).sum();
            col_means.push(col_sum / n_samples as f64);
        }
        
        let centered = matrix.map_with_location(|_row, col, val| val - col_means[col]);
        
        println!("Data centered, computing SVD for PCA...");
        // Compute SVD for PCA
        let svd = centered.svd(true, false);
        
        // Take first 2 components (first 2 columns of U matrix)
        let u = svd.u.ok_or_else(|| FontError::Vectorization("SVD failed to compute U matrix".to_string()))?;
        
        println!("SVD completed, saving compressed vectors in parallel...");
        
        // Prepare data for parallel saving
        let save_data: Vec<_> = font_names.iter().enumerate().map(|(i, font_name)| {
            let x = u[(i, 0)] as f32;
            let y = if u.ncols() > 1 { u[(i, 1)] as f32 } else { 0.0 };
            (font_name.clone(), x, y)
        }).collect();
        
        // Save compressed vectors in parallel (format: FontName,X,Y)
        println!("Creating {} parallel save tasks...", save_data.len());
        let save_tasks: Vec<_> = save_data.into_iter().map(|(font_name, x, y)| {
            let comp_vector_dir = comp_vector_dir.clone();
            task::spawn_blocking(move || {
                let file_path = comp_vector_dir.join(format!("{}.csv", font_name));
                
                let mut file = fs::File::create(&file_path)
                    .map_err(|e| FontError::Vectorization(format!("Failed to create compressed vector file: {}", e)))?;
                
                // Write in format: FontName,X,Y
                writeln!(file, "{},{},{}", font_name, x, y)
                    .map_err(|e| FontError::Vectorization(format!("Failed to write compressed vector: {}", e)))?;
                
                println!("✓ Compressed vector for '{}' saved successfully: ({:.3}, {:.3})", font_name, x, y);
                Ok(())
            })
        }).collect();
        
        // Wait for all save tasks to complete
        let save_results = join_all(save_tasks).await;
        println!("Parallel save tasks completed, checking results...");
        
        // Check for any errors in saving
        for (i, result) in save_results.into_iter().enumerate() {
            match result {
                Ok(Ok(())) => {}, // Success
                Ok(Err(e)) => return Err(e), // File operation error
                Err(e) => return Err(FontError::Vectorization(format!("Save task {} failed: {}", i, e))),
            }
        }
        
        println!("Compressed {} vectors to 2D and saved to CompressedVectors directory", font_names.len());
        Ok(())
    }
}