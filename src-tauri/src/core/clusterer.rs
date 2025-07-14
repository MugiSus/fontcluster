use crate::core::SessionManager;
use crate::error::{FontResult, FontError};
use std::path::PathBuf;
use std::fs;
use tokio::task;
use futures::future::join_all;
use std::io::Write;
use hdbscan::{Hdbscan, HdbscanHyperParams};

// Type aliases for better readability
type VectorData = (String, f32, f32);
type ClusterLabels = Vec<i32>;

// Vector clustering service
pub struct VectorClusterer;

impl VectorClusterer {
    pub fn new() -> FontResult<Self> {
        Ok(Self)
    }
    
    pub async fn cluster_compressed_vectors(&self) -> FontResult<(PathBuf, usize, usize)> {
        let vector_data = self.load_compressed_vectors().await?;
        let sample_amount = vector_data.len();
        
        let (cluster_labels, cluster_size) = Self::cluster_vectors(&vector_data)?;
        
        Self::save_clustered_vectors(&vector_data, &cluster_labels).await?;
        
        println!("Clustering completed successfully!");
        Ok((SessionManager::global().get_session_dir(), cluster_size, sample_amount))
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
    
    
    
    
    // Pure function: perform clustering
    fn cluster_vectors(vector_data: &[VectorData]) -> FontResult<(ClusterLabels, usize)> {
        // Convert data to the format expected by HDBSCAN
        let data_points: Vec<Vec<f32>> = vector_data
            .iter()
            .map(|(_, x, y)| vec![*x, *y])
            .collect();
        
        println!("Performing HDBSCAN clustering on {} points...", data_points.len());
        
        // Configure HDBSCAN parameters for 4-8 clusters with minimal noise (400 samples target)
        let hyper_params = HdbscanHyperParams::builder()
            .min_cluster_size((data_points.len() as f64 * 0.03) as usize)
            .max_cluster_size((data_points.len() as f64 * 0.35) as usize)
            // .epsilon(0.5)
            .min_samples(1)  // Lower density requirement to reduce noise
            .build();
        
        // Create HDBSCAN clusterer and perform clustering
        let clusterer = Hdbscan::new(&data_points, hyper_params);
        let labels = clusterer.cluster()
            .map_err(|e| FontError::Vectorization(format!("HDBSCAN clustering failed: {:?}", e)))?;
        
        // Keep original HDBSCAN labels (-1 for noise, 0+ for clusters)
        let cluster_labels: ClusterLabels = labels;
        
        // Count unique clusters (excluding noise)
        let unique_clusters: std::collections::HashSet<_> = cluster_labels.iter().filter(|&&label| label >= 0).collect();
        let num_clusters = unique_clusters.len();
        
        let cluster_counts = Self::count_clusters(&cluster_labels);
        Self::log_cluster_distribution(&cluster_counts);
        
        println!("HDBSCAN found {} clusters", num_clusters);
        
        Ok((cluster_labels, num_clusters))
    }
    
    // Pure function: count cluster distribution
    fn count_clusters(cluster_labels: &[i32]) -> std::collections::HashMap<i32, usize> {
        let mut counts = std::collections::HashMap::new();
        cluster_labels.iter().for_each(|&label| {
            *counts.entry(label).or_insert(0) += 1;
        });
        counts
    }
    
    // Pure function: log cluster distribution
    fn log_cluster_distribution(cluster_counts: &std::collections::HashMap<i32, usize>) {
        println!("Cluster distribution:");
        let mut sorted_clusters: Vec<_> = cluster_counts.iter().collect();
        sorted_clusters.sort_by_key(|&(&cluster, _)| cluster);
        
        sorted_clusters.iter().for_each(|(&cluster, &count)| {
            if cluster == -1 {
                println!("  Noise: {} fonts", count);
            } else {
                println!("  Cluster {}: {} fonts", cluster, count);
            }
        });
    }
    
    // Higher-order function: create save task
    fn create_save_task(
        font_name: String, 
        x: f32, 
        y: f32, 
        cluster: i32
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
        cluster_labels: &[i32]
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
        
        println!("Clustered {} vectors using HDBSCAN and updated files", vector_data.len());
        Ok(())
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