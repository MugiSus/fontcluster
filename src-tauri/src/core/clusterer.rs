use crate::core::SessionManager;
use crate::error::{FontResult, FontError};
use std::path::PathBuf;
use std::fs;
use tokio::task;
use futures::future::join_all;
use ndarray::Array2;
use rand::Rng;
use std::io::Write;

// Vector clustering service
pub struct VectorClusterer;

impl VectorClusterer {
    pub fn new() -> FontResult<Self> {
        Ok(Self)
    }
    
    pub async fn cluster_compressed_vectors(&self) -> FontResult<PathBuf> {
        let compressed_vectors = self.get_compressed_vector_files()?;
        println!("Found {} compressed vector files to cluster", compressed_vectors.len());
        
        if compressed_vectors.is_empty() {
            return Err(FontError::Vectorization("No compressed vector files found".to_string()));
        }
        
        // Read all compressed vectors in parallel
        println!("Starting parallel compressed vector reading for {} files...", compressed_vectors.len());
        let vector_tasks: Vec<_> = compressed_vectors.into_iter()
            .filter_map(|vector_path| {
                // Extract font name from path: Generated/session_id/font_name/compressed-vector.csv
                vector_path.parent()
                    .and_then(|parent| parent.file_name())
                    .and_then(|name| name.to_str())
                    .map(|font_name| {
                        let font_name = font_name.to_string();
                        let path = vector_path.clone();
                        task::spawn_blocking(move || {
                            match VectorClusterer::read_compressed_vector_file_static(&path) {
                                Ok((x, y)) => {
                                    println!("✓ Compressed vector file '{}' loaded successfully: ({:.3}, {:.3})", font_name, x, y);
                                    Some((font_name, x, y))
                                },
                                Err(e) => {
                                    eprintln!("Failed to read compressed vector file {}: {}", path.display(), e);
                                    None
                                }
                            }
                        })
                    })
            })
            .collect();

        let results = join_all(vector_tasks).await;
        println!("Completed parallel compressed vector reading, processing results...");
        
        let vector_data: Vec<(String, f32, f32)> = results
            .into_iter()
            .filter_map(|task_result| match task_result {
                Ok(Some(data)) => Some(data),
                Ok(None) => None, // File read failed, already logged
                Err(e) => {
                    eprintln!("Task execution failed: {}", e);
                    None
                }
            })
            .collect();
        
        if vector_data.is_empty() {
            return Err(FontError::Vectorization("No valid compressed vectors found".to_string()));
        }
        
        println!("Successfully loaded {} compressed vectors, starting clustering...", vector_data.len());
        
        // Perform clustering
        Self::cluster_vectors_and_save(&vector_data).await?;
        
        println!("Clustering completed successfully!");
        Ok(SessionManager::global().get_session_dir())
    }
    
    fn get_compressed_vector_files(&self) -> FontResult<Vec<PathBuf>> {
        let session_manager = SessionManager::global();
        let session_dir = session_manager.get_session_dir();
        
        Ok(fs::read_dir(&session_dir)?
            .filter_map(|entry| entry.ok())
            .filter(|entry| entry.path().is_dir())
            .filter_map(|entry| {
                let font_dir = entry.path();
                let compressed_vector_path = font_dir.join("compressed-vector.csv");
                if compressed_vector_path.exists() {
                    Some(compressed_vector_path)
                } else {
                    None
                }
            })
            .collect())
    }
    
    fn read_compressed_vector_file_static(path: &PathBuf) -> FontResult<(f32, f32)> {
        let content = fs::read_to_string(path)
            .map_err(|e| FontError::Vectorization(format!("Failed to read compressed vector file: {}", e)))?;
        
        let mut values = content.trim().split(',');
        let x = values.next()
            .ok_or_else(|| FontError::Vectorization("Missing X coordinate".to_string()))?
            .parse::<f32>()
            .map_err(|e| FontError::Vectorization(format!("Failed to parse X coordinate: {}", e)))?;
        let y = values.next()
            .ok_or_else(|| FontError::Vectorization("Missing Y coordinate".to_string()))?
            .parse::<f32>()
            .map_err(|e| FontError::Vectorization(format!("Failed to parse Y coordinate: {}", e)))?;
        
        Ok((x, y))
    }

    async fn cluster_vectors_and_save(vector_data: &[(String, f32, f32)]) -> FontResult<()> {
        let n_samples = vector_data.len();
        
        // Create ndarray from vector data for clustering
        let data_matrix = Array2::from_shape_fn((n_samples, 2), |(i, j)| {
            match j {
                0 => vector_data[i].1, // x coordinate
                1 => vector_data[i].2, // y coordinate
                _ => 0.0,
            }
        });
        
        println!("Matrix created, using fixed K=6 for clustering...");
        
        // Use fixed K=6 for clustering
        let k = 7; 
        let cluster_labels = Self::perform_kmeans_clustering(&data_matrix, k)?;
        
        println!("Clustering completed, saving updated compressed vectors with cluster labels...");
        
        // Save updated compressed vectors in parallel (format: X,Y,ClusterNumber)
        println!("Creating {} parallel save tasks...", vector_data.len());
        let save_tasks: Vec<_> = vector_data.iter().enumerate().map(|(i, (font_name, x, y))| {
            let cluster = cluster_labels[i];
            let font_name = font_name.clone();
            let x = *x;
            let y = *y;
            task::spawn_blocking(move || {
                let session_manager = SessionManager::global();
                let font_dir = session_manager.get_font_directory(&font_name);
                let file_path = font_dir.join("compressed-vector.csv");
                
                let mut file = fs::File::create(&file_path)
                    .map_err(|e| FontError::Vectorization(format!("Failed to create compressed vector file: {}", e)))?;
                
                // Write in format: X,Y,ClusterNumber
                writeln!(file, "{},{},{}", x, y, cluster)
                    .map_err(|e| FontError::Vectorization(format!("Failed to write compressed vector: {}", e)))?;
                
                println!("✓ Updated compressed vector for '{}': ({:.3}, {:.3}, cluster={})", font_name, x, y, cluster);
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
        
        println!("Clustered {} vectors using K-means (K=6) and updated files", vector_data.len());
        Ok(())
    }
    
    
    fn perform_kmeans_clustering(embedding: &Array2<f32>, k: usize) -> FontResult<Vec<usize>> {
        println!("Performing K-means clustering with K={}...", k);
        
        let (_centroids, labels) = Self::simple_kmeans(embedding, k, 300)?;
        
        // Convert to 1-based indexing
        let cluster_labels: Vec<usize> = labels.iter().map(|&label| label + 1).collect();
        
        // Print cluster distribution
        let mut cluster_counts = vec![0; k];
        for &label in &cluster_labels {
            cluster_counts[label - 1] += 1;
        }
        
        println!("Cluster distribution:");
        for (i, &count) in cluster_counts.iter().enumerate() {
            println!("  Cluster {}: {} fonts", i + 1, count);
        }
        
        Ok(cluster_labels)
    }
    
    fn simple_kmeans(data: &Array2<f32>, k: usize, max_iters: usize) -> FontResult<(Array2<f32>, Vec<usize>)> {
        let n_samples = data.nrows();
        let n_features = data.ncols();
        
        if k == 1 {
            // Special case: single cluster
            let centroid = Array2::from_shape_vec((1, n_features), 
                (0..n_features).map(|j| {
                    (0..n_samples).map(|i| data[[i, j]]).sum::<f32>() / n_samples as f32
                }).collect()
            ).map_err(|e| FontError::Vectorization(format!("Failed to create centroid: {}", e)))?;
            
            return Ok((centroid, vec![0; n_samples]));
        }
        
        // Initialize centroids randomly using K-means++
        let mut rng = rand::thread_rng();
        let mut centroids = Array2::zeros((k, n_features));
        
        // First centroid: random point
        let first_idx = rng.gen_range(0..n_samples);
        for j in 0..n_features {
            centroids[[0, j]] = data[[first_idx, j]];
        }
        
        // Remaining centroids: K-means++
        for i in 1..k {
            let mut distances = vec![f32::INFINITY; n_samples];
            
            // Calculate minimum distance to existing centroids
            for p in 0..n_samples {
                for c in 0..i {
                    let dist: f32 = (0..n_features)
                        .map(|j| (data[[p, j]] - centroids[[c, j]]).powi(2))
                        .sum();
                    distances[p] = distances[p].min(dist);
                }
            }
            
            // Choose next centroid with probability proportional to squared distance
            let total_dist: f32 = distances.iter().sum();
            let mut cumulative = 0.0;
            let threshold = rng.gen::<f32>() * total_dist;
            
            let mut chosen_idx = 0;
            for (idx, &dist) in distances.iter().enumerate() {
                cumulative += dist;
                if cumulative >= threshold {
                    chosen_idx = idx;
                    break;
                }
            }
            
            for j in 0..n_features {
                centroids[[i, j]] = data[[chosen_idx, j]];
            }
        }
        
        let mut labels = vec![0; n_samples];
        
        // K-means iterations
        for _iter in 0..max_iters {
            let mut changed = false;
            
            // Assign points to nearest centroid
            for i in 0..n_samples {
                let mut min_dist = f32::INFINITY;
                let mut best_cluster = 0;
                
                for c in 0..k {
                    let dist: f32 = (0..n_features)
                        .map(|j| (data[[i, j]] - centroids[[c, j]]).powi(2))
                        .sum::<f32>()
                        .sqrt();
                    
                    if dist < min_dist {
                        min_dist = dist;
                        best_cluster = c;
                    }
                }
                
                if labels[i] != best_cluster {
                    labels[i] = best_cluster;
                    changed = true;
                }
            }
            
            // Update centroids
            for c in 0..k {
                let cluster_points: Vec<usize> = labels.iter().enumerate()
                    .filter(|(_, &label)| label == c)
                    .map(|(idx, _)| idx)
                    .collect();
                
                if !cluster_points.is_empty() {
                    for j in 0..n_features {
                        let mean = cluster_points.iter()
                            .map(|&idx| data[[idx, j]])
                            .sum::<f32>() / cluster_points.len() as f32;
                        centroids[[c, j]] = mean;
                    }
                }
            }
            
            if !changed {
                break;
            }
        }
        
        Ok((centroids, labels))
    }
}