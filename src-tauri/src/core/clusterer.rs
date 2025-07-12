use crate::core::SessionManager;
use crate::error::{FontResult, FontError};
use std::path::PathBuf;
use std::fs;
use tokio::task;
use futures::future::join_all;
use ndarray::Array2;
use rand::Rng;
use std::io::Write;

// Type aliases for better readability
type VectorData = (String, f32, f32);
type ClusterLabels = Vec<usize>;

// Vector clustering service
pub struct VectorClusterer;

impl VectorClusterer {
    pub fn new() -> FontResult<Self> {
        Ok(Self)
    }
    
    pub async fn cluster_compressed_vectors(&self) -> FontResult<PathBuf> {
        let vector_data = self.load_compressed_vectors().await?;
        
        let k = 8; // Fixed K=8 for consistent clustering
        let cluster_labels = Self::cluster_vectors(&vector_data, k)?;
        
        Self::save_clustered_vectors(&vector_data, &cluster_labels).await?;
        
        println!("Clustering completed successfully!");
        Ok(SessionManager::global().get_session_dir())
    }
    
    // Pure function: file discovery
    fn get_compressed_vector_files(&self) -> FontResult<Vec<PathBuf>> {
        let session_dir = SessionManager::global().get_session_dir();
        
        fs::read_dir(&session_dir)?
            .filter_map(Result::ok)
            .filter(|entry| entry.path().is_dir())
            .map(|entry| entry.path().join("compressed-vector.csv"))
            .filter(|path| path.exists())
            .collect::<Vec<_>>()
            .pipe(Ok)
    }
    
    // Pure function: parse coordinate pair
    fn parse_coordinates(content: &str) -> FontResult<(f32, f32)> {
        let coordinates: Result<Vec<f32>, _> = content
            .trim()
            .split(',')
            .take(2)
            .map(str::parse)
            .collect();
            
        coordinates
            .map_err(|e| FontError::Vectorization(format!("Failed to parse coordinates: {}", e)))
            .and_then(|coords| {
                if coords.len() >= 2 {
                    Ok((coords[0], coords[1]))
                } else {
                    Err(FontError::Vectorization("Insufficient coordinates".to_string()))
                }
            })
    }
    
    // Pure function: read single vector file
    fn read_compressed_vector_file_static(path: &PathBuf) -> FontResult<(f32, f32)> {
        fs::read_to_string(path)
            .map_err(|e| FontError::Vectorization(format!("Failed to read file: {}", e)))
            .and_then(|content| Self::parse_coordinates(&content))
    }
    
    // Higher-order function: extract font name from path
    fn extract_font_name(path: &PathBuf) -> Option<String> {
        path.parent()
            .and_then(|parent| parent.file_name())
            .and_then(|name| name.to_str())
            .map(String::from)
    }
    
    // Async composition: load all vectors
    async fn load_compressed_vectors(&self) -> FontResult<Vec<VectorData>> {
        let compressed_vectors = self.get_compressed_vector_files()?;
        println!("Found {} compressed vector files to cluster", compressed_vectors.len());
        
        if compressed_vectors.is_empty() {
            return Err(FontError::Vectorization("No compressed vector files found".to_string()));
        }
        
        let vector_tasks = compressed_vectors
            .into_iter()
            .filter_map(|path| {
                Self::extract_font_name(&path).map(|font_name| {
                    let path_clone = path.clone();
                    task::spawn_blocking(move || {
                        Self::read_compressed_vector_file_static(&path_clone)
                            .map(|(x, y)| {
                                println!("✓ Loaded vector '{}': ({:.3}, {:.3})", font_name, x, y);
                                (font_name, x, y)
                            })
                            .ok()
                    })
                })
            })
            .collect::<Vec<_>>();

        let results = join_all(vector_tasks).await;
        let vector_data = results
            .into_iter()
            .filter_map(|result| result.ok().flatten())
            .collect::<Vec<_>>();
        
        if vector_data.is_empty() {
            Err(FontError::Vectorization("No valid compressed vectors found".to_string()))
        } else {
            println!("Successfully loaded {} compressed vectors", vector_data.len());
            Ok(vector_data)
        }
    }
    
    // Pure function: create data matrix
    fn create_data_matrix(vector_data: &[VectorData]) -> Array2<f32> {
        let n_samples = vector_data.len();
        Array2::from_shape_fn((n_samples, 2), |(i, j)| {
            match j {
                0 => vector_data[i].1, // x coordinate
                1 => vector_data[i].2, // y coordinate
                _ => 0.0,
            }
        })
    }
    
    
    
    // Pure function: perform clustering
    fn cluster_vectors(vector_data: &[VectorData], k: usize) -> FontResult<ClusterLabels> {
        let data_matrix = Self::create_data_matrix(vector_data);
        println!("Performing K-means clustering with K={}...", k);
        
        let (_centroids, labels) = Self::simple_kmeans(&data_matrix, k, 300)?;
        
        // Convert to 1-based indexing and log distribution
        let cluster_labels: ClusterLabels = labels.iter().map(|&label| label + 1).collect();
        
        let cluster_counts = Self::count_clusters(&cluster_labels, k);
        Self::log_cluster_distribution(&cluster_counts);
        
        Ok(cluster_labels)
    }
    
    // Pure function: count cluster distribution
    fn count_clusters(cluster_labels: &[usize], k: usize) -> Vec<usize> {
        let mut counts = vec![0; k];
        cluster_labels.iter().for_each(|&label| {
            if label > 0 && label <= k {
                counts[label - 1] += 1;
            }
        });
        counts
    }
    
    // Pure function: log cluster distribution
    fn log_cluster_distribution(cluster_counts: &[usize]) {
        println!("Cluster distribution:");
        cluster_counts
            .iter()
            .enumerate()
            .for_each(|(i, &count)| println!("  Cluster {}: {} fonts", i + 1, count));
    }
    
    // Higher-order function: create save task
    fn create_save_task(
        font_name: String, 
        x: f32, 
        y: f32, 
        cluster: usize
    ) -> task::JoinHandle<FontResult<()>> {
        task::spawn_blocking(move || {
            let session_manager = SessionManager::global();
            let font_dir = session_manager.get_font_directory(&font_name);
            let file_path = font_dir.join("compressed-vector.csv");
            
            let mut file = fs::File::create(&file_path)
                .map_err(|e| FontError::Vectorization(format!("Failed to create file: {}", e)))?;
            
            writeln!(file, "{},{},{}", x, y, cluster)
                .map_err(|e| FontError::Vectorization(format!("Failed to write: {}", e)))?;
            
            println!("✓ Updated vector '{}': ({:.3}, {:.3}, cluster={})", font_name, x, y, cluster);
            Ok(())
        })
    }
    
    // Async composition: save all clustered vectors
    async fn save_clustered_vectors(
        vector_data: &[VectorData], 
        cluster_labels: &[usize]
    ) -> FontResult<()> {
        println!("Creating {} parallel save tasks...", vector_data.len());
        
        let save_tasks = vector_data
            .iter()
            .zip(cluster_labels.iter())
            .map(|((font_name, x, y), &cluster)| {
                Self::create_save_task(font_name.clone(), *x, *y, cluster)
            })
            .collect::<Vec<_>>();
        
        let save_results = join_all(save_tasks).await;
        
        for (i, result) in save_results.into_iter().enumerate() {
            result
                .map_err(|e| FontError::Vectorization(format!("Save task {} failed: {}", i, e)))?
                .map_err(|e| e)?;
        }
        
        println!("Clustered {} vectors using K-means (K=8) and updated files", vector_data.len());
        Ok(())
    }
    
    // Pure function: create single cluster centroid
    fn create_single_cluster_centroid(data: &Array2<f32>) -> FontResult<Array2<f32>> {
        let n_samples = data.nrows();
        let n_features = data.ncols();
        
        let centroid_data = (0..n_features)
            .map(|j| (0..n_samples).map(|i| data[[i, j]]).sum::<f32>() / n_samples as f32)
            .collect();
            
        Array2::from_shape_vec((1, n_features), centroid_data)
            .map_err(|e| FontError::Vectorization(format!("Failed to create centroid: {}", e)))
    }
    
    // Pure function: initialize first centroid
    fn initialize_first_centroid(data: &Array2<f32>, rng: &mut impl Rng) -> (Array2<f32>, usize) {
        let n_samples = data.nrows();
        let n_features = data.ncols();
        let first_idx = rng.gen_range(0..n_samples);
        
        let mut centroids = Array2::zeros((1, n_features));
        (0..n_features).for_each(|j| centroids[[0, j]] = data[[first_idx, j]]);
        
        (centroids, first_idx)
    }
    
    // Pure function: calculate distances to existing centroids
    fn calculate_distances_to_centroids(
        data: &Array2<f32>, 
        centroids: &Array2<f32>, 
        num_centroids: usize
    ) -> Vec<f32> {
        let n_samples = data.nrows();
        let n_features = data.ncols();
        
        (0..n_samples)
            .map(|p| {
                (0..num_centroids)
                    .map(|c| {
                        (0..n_features)
                            .map(|j| (data[[p, j]] - centroids[[c, j]]).powi(2))
                            .sum::<f32>()
                    })
                    .fold(f32::INFINITY, f32::min)
            })
            .collect()
    }
    
    // Pure function: select next centroid using weighted probability
    fn select_next_centroid(distances: &[f32], rng: &mut impl Rng) -> usize {
        let total_dist: f32 = distances.iter().sum();
        let threshold = rng.gen::<f32>() * total_dist;
        
        distances
            .iter()
            .scan(0.0, |cumulative, &dist| {
                *cumulative += dist;
                Some(*cumulative)
            })
            .position(|cumulative| cumulative >= threshold)
            .unwrap_or(0)
    }
    
    // K-means implementation with functional approach
    fn simple_kmeans(data: &Array2<f32>, k: usize, max_iters: usize) -> FontResult<(Array2<f32>, Vec<usize>)> {
        let n_samples = data.nrows();
        let n_features = data.ncols();
        
        if k == 1 {
            let centroid = Self::create_single_cluster_centroid(data)?;
            return Ok((centroid, vec![0; n_samples]));
        }
        
        let mut rng = rand::thread_rng();
        let mut centroids = Array2::zeros((k, n_features));
        
        // Initialize with k-means++
        let first_idx = rng.gen_range(0..n_samples);
        (0..n_features).for_each(|j| centroids[[0, j]] = data[[first_idx, j]]);
        
        for i in 1..k {
            let distances = Self::calculate_distances_to_centroids(data, &centroids, i);
            let chosen_idx = Self::select_next_centroid(&distances, &mut rng);
            (0..n_features).for_each(|j| centroids[[i, j]] = data[[chosen_idx, j]]);
        }
        
        let mut labels = vec![0; n_samples];
        
        // Iterative refinement
        for _iter in 0..max_iters {
            let old_labels = labels.clone();
            
            // Assign points to nearest centroids
            labels = (0..n_samples)
                .map(|i| {
                    (0..k)
                        .map(|c| {
                            (0..n_features)
                                .map(|j| (data[[i, j]] - centroids[[c, j]]).powi(2))
                                .sum::<f32>()
                                .sqrt()
                        })
                        .enumerate()
                        .min_by(|a, b| a.1.partial_cmp(&b.1).unwrap_or(std::cmp::Ordering::Equal))
                        .map(|(cluster, _)| cluster)
                        .unwrap_or(0)
                })
                .collect();
            
            // Update centroids
            for c in 0..k {
                let cluster_points: Vec<usize> = labels
                    .iter()
                    .enumerate()
                    .filter(|(_, &label)| label == c)
                    .map(|(idx, _)| idx)
                    .collect();
                
                if !cluster_points.is_empty() {
                    (0..n_features).for_each(|j| {
                        let mean = cluster_points
                            .iter()
                            .map(|&idx| data[[idx, j]])
                            .sum::<f32>() / cluster_points.len() as f32;
                        centroids[[c, j]] = mean;
                    });
                }
            }
            
            // Check convergence
            if labels == old_labels {
                break;
            }
        }
        
        Ok((centroids, labels))
    }
}

// Extension trait for pipeline operations
trait Pipe<T> {
    fn pipe<U, F>(self, f: F) -> U where F: FnOnce(T) -> U;
}

impl<T> Pipe<T> for T {
    fn pipe<U, F>(self, f: F) -> U where F: FnOnce(T) -> U {
        f(self)
    }
}