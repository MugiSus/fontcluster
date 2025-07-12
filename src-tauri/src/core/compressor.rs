use crate::core::SessionManager;
use crate::error::{FontResult, FontError};
use std::path::PathBuf;
use std::fs;
use tokio::task;
use futures::future::join_all;
use ndarray::Array2;
use pacmap::{Configuration, fit_transform};
use std::io::Write;
use rand::Rng;

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
                // Extract font name from path: Generated/session_id/font_name/vector.csv
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
                let vector_path = font_dir.join("vector.csv");
                if vector_path.exists() {
                    Some(vector_path)
                } else {
                    None
                }
            })
            .collect())
    }
    
    fn read_vector_file_static(path: &PathBuf) -> FontResult<Vec<f32>> {
        let content = fs::read_to_string(path)
            .map_err(|e| FontError::Vectorization(format!("Failed to read vector file: {}", e)))?;
        
        content.trim()
            .split(',')
            .map(|s| s.parse::<f32>())
            .collect::<Result<Vec<f32>, _>>()
            .map_err(|e| FontError::Vectorization(format!("Failed to parse vector values: {}", e)))
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
        
        // Configure PaCMAP for maximum continuous distribution, avoiding local clustering
        let config = Configuration::builder()
            .embedding_dimensions(2)
            .seed(42)
            .num_iters((100, 100, 250))
            .learning_rate(1.0)
            .mid_near_ratio(0.5)
            .far_pair_ratio(2.0)
            .build();
        
        println!("Data prepared, running PaCMAP dimensionality reduction...");
        
        // Run PaCMAP compression in a blocking task since it's CPU intensive
        let embedding_result = task::spawn_blocking(move || {
            fit_transform(data_matrix.view(), config)
        }).await
        .map_err(|e| FontError::Vectorization(format!("PaCMAP task failed: {}", e)))?
        .map_err(|e| FontError::Vectorization(format!("PaCMAP computation failed: {}", e)))?;
        
        let (embedding, _) = embedding_result;
        
        println!("PaCMAP completed, performing K-means clustering...");
        
        // Estimate optimal K and perform clustering
        let optimal_k = Self::estimate_optimal_k(&embedding)?;
        let cluster_labels = Self::perform_kmeans_clustering(&embedding, optimal_k)?;
        
        println!("Clustering completed, saving compressed vectors with cluster labels...");
        
        // Save compressed vectors in parallel (format: X,Y,ClusterNumber)
        println!("Creating {} parallel save tasks...", font_names.len());
        let save_tasks: Vec<_> = font_names.iter().enumerate().map(|(i, font_name)| {
            let x = embedding[[i, 0]];
            let y = if embedding.ncols() > 1 { embedding[[i, 1]] } else { 0.0 };
            let cluster = cluster_labels[i];
            let font_name = font_name.clone();
            task::spawn_blocking(move || {
                let session_manager = SessionManager::global();
                let font_dir = session_manager.get_font_directory(&font_name);
                let file_path = font_dir.join("compressed-vector.csv");
                
                let mut file = fs::File::create(&file_path)
                    .map_err(|e| FontError::Vectorization(format!("Failed to create compressed vector file: {}", e)))?;
                
                // Write in format: X,Y,ClusterNumber
                writeln!(file, "{},{},{}", x, y, cluster)
                    .map_err(|e| FontError::Vectorization(format!("Failed to write compressed vector: {}", e)))?;
                
                println!("✓ Compressed vector for '{}' saved: ({:.3}, {:.3}, cluster={})", font_name, x, y, cluster);
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
        
        println!("Compressed {} vectors to 2D using PaCMAP and clustered with K-means (K={})", font_names.len(), optimal_k);
        Ok(())
    }
    
    fn estimate_optimal_k(embedding: &Array2<f32>) -> FontResult<usize> {
        let n_samples = embedding.nrows();
        
        // For small datasets, use simple rules
        if n_samples <= 3 {
            return Ok(1);
        } else if n_samples <= 6 {
            return Ok(2);
        } else if n_samples <= 12 {
            return Ok(3);
        }
        
        // For larger datasets, use Elbow method with WCSS (Within-Cluster Sum of Squares)
        let max_k = std::cmp::min(8, n_samples / 2); // Reasonable upper bound
        let mut wcss_values = Vec::new();
        
        println!("Estimating optimal K using Elbow method (testing K=1 to {})...", max_k);
        
        for k in 1..=max_k {
            let (centroids, labels) = Self::simple_kmeans(embedding, k, 100)?;
            
            // Calculate WCSS
            let mut wcss = 0.0;
            for (i, &label) in labels.iter().enumerate() {
                let point = embedding.row(i);
                let centroid_idx = label;
                let distance_sq: f32 = point.iter().zip(centroids.row(centroid_idx).iter())
                    .map(|(a, b)| (a - b).powi(2))
                    .sum();
                wcss += distance_sq;
            }
            
            wcss_values.push(wcss);
            println!("K={}: WCSS={:.3}", k, wcss);
        }
        
        // Find elbow point using rate of change
        let mut optimal_k = 3; // Default fallback
        let mut max_improvement = 0.0;
        
        for i in 1..(wcss_values.len() - 1) {
            if i == 0 { continue; }
            
            let improvement = wcss_values[i - 1] - wcss_values[i];
            let next_improvement = wcss_values[i] - wcss_values[i + 1];
            let rate_change = improvement - next_improvement;
            
            if rate_change > max_improvement {
                max_improvement = rate_change;
                optimal_k = i + 1; // +1 because k starts from 1
            }
        }
        
        // Ensure reasonable bounds
        optimal_k = std::cmp::max(2, std::cmp::min(optimal_k, 6));
        
        println!("Estimated optimal K: {}", optimal_k);
        Ok(optimal_k)
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