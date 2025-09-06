use crate::core::SessionManager;
use crate::config::{FontConfig, ComputedData};
use crate::error::{FontResult, FontError};
use std::path::PathBuf;
use std::fs;
use tokio::task;
use futures::future::join_all;
use linfa::prelude::*;
use linfa_clustering::GaussianMixtureModel;
use ndarray_015::{Array1, Array2};

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
    fn get_font_config_files(&self) -> FontResult<Vec<PathBuf>> {
        let session_dir = SessionManager::global().get_session_dir();
        
        fs::read_dir(&session_dir)?
            .filter_map(Result::ok)
            .filter(|entry| entry.path().is_dir())
            .map(|entry| entry.path().join("config.json"))
            .filter(|path| path.exists())
            .collect::<Vec<_>>()
            .pipe(Ok)
    }
    
    
    // Pure function: read vector from config.json
    fn read_config_vector_static(config_path: &PathBuf) -> FontResult<(f32, f32)> {
        let config_str = fs::read_to_string(config_path)
            .map_err(|e| FontError::Vectorization(format!("Failed to read config file: {}", e)))?;
        
        let font_config: FontConfig = serde_json::from_str(&config_str)
            .map_err(|e| FontError::Vectorization(format!("Failed to parse config JSON: {}", e)))?;
        
        let computed = font_config.computed
            .ok_or_else(|| FontError::Vectorization("No computed data found in config".to_string()))?;
        
        if computed.vector.len() >= 2 {
            Ok((computed.vector[0], computed.vector[1]))
        } else {
            Err(FontError::Vectorization("Invalid vector data in config".to_string()))
        }
    }
    
    // Higher-order function: extract font name from path
    fn extract_font_name(path: &PathBuf) -> Option<String> {
        path.parent()
            .and_then(|parent| parent.file_name())
            .and_then(|name| name.to_str())
            .map(String::from)
    }
    
    // Async composition: load all vectors from config.json files
    async fn load_compressed_vectors(&self) -> FontResult<Vec<VectorData>> {
        let config_files = self.get_font_config_files()?;
        println!("Found {} config files to load compressed vectors from", config_files.len());
        
        if config_files.is_empty() {
            return Err(FontError::Vectorization("No config files found".to_string()));
        }
        
        let vector_tasks = config_files
            .into_iter()
            .filter_map(|config_path| {
                Self::extract_font_name(&config_path).map(|font_name| {
                    let path_clone = config_path.clone();
                    task::spawn_blocking(move || {
                        Self::read_config_vector_static(&path_clone)
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
    
    
    
    
    // Pure function: perform clustering using Gaussian Mixture Model
    fn cluster_vectors(vector_data: &[VectorData]) -> FontResult<(ClusterLabels, usize)> {
        let n_samples = vector_data.len();
        
        // Convert data to ndarray format for linfa
        let data_flat: Vec<f64> = vector_data
            .iter()
            .flat_map(|(_, x, y)| vec![*x as f64, *y as f64])
            .collect();
        
        let data_matrix = Array2::from_shape_vec((n_samples, 2), data_flat)
            .map_err(|e| FontError::Vectorization(format!("Failed to create data matrix: {}", e)))?;
        
        println!("Performing Gaussian Mixture clustering on {} points...", n_samples);
        
        // Estimate optimal number of components based on data size
        let n_components = std::cmp::min(8, std::cmp::max(2, (n_samples as f64 * 0.1) as usize));
        println!("Using {} components for Gaussian Mixture Model", n_components);
        
        // Create dataset for unsupervised learning
        let targets = Array1::<usize>::zeros(n_samples);
        let dataset = Dataset::new(data_matrix, targets);
        
        // Configure Gaussian Mixture Model with epsilon tolerance of 0.5
        let gmm = GaussianMixtureModel::params(n_components)
            .tolerance(0.5)
            .fit(&dataset)
            .map_err(|e| FontError::Vectorization(format!("Gaussian Mixture clustering failed: {:?}", e)))?;
        
        // Predict cluster assignments
        let predictions = gmm.predict(&dataset);
        let cluster_labels: ClusterLabels = predictions.iter().map(|&x| x as i32).collect();
        
        // Count unique clusters
        let unique_clusters: std::collections::HashSet<_> = cluster_labels.iter().collect();
        let num_clusters = unique_clusters.len();
        
        let cluster_counts = Self::count_clusters(&cluster_labels);
        Self::log_cluster_distribution(&cluster_counts);
        
        println!("Gaussian Mixture found {} clusters", num_clusters);
        
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
    
    // Higher-order function: create save task for config.json
    fn create_save_task(
        font_name: String, 
        x: f32, 
        y: f32, 
        cluster: i32
    ) -> task::JoinHandle<FontResult<()>> {
        task::spawn_blocking(move || {
            let session_manager = SessionManager::global();
            let font_dir = session_manager.get_font_directory(&font_name);
            let config_path = font_dir.join("config.json");
            
            // Load existing font config
            let config_str = fs::read_to_string(&config_path)
                .map_err(|e| FontError::Vectorization(format!("Failed to read config file: {}", e)))?;
            
            let mut font_config: FontConfig = serde_json::from_str(&config_str)
                .map_err(|e| FontError::Vectorization(format!("Failed to parse config JSON: {}", e)))?;
            
            // Update cluster assignment in computed data
            if let Some(ref mut computed) = font_config.computed {
                computed.k = cluster;
            } else {
                // This shouldn't happen if compression ran first, but handle gracefully
                font_config.computed = Some(ComputedData {
                    vector: vec![x, y],
                    k: cluster,
                });
            }
            
            // Save updated config
            let config_json = serde_json::to_string_pretty(&font_config)
                .map_err(|e| FontError::Vectorization(format!("Failed to serialize config: {}", e)))?;
            
            fs::write(&config_path, config_json)
                .map_err(|e| FontError::Vectorization(format!("Failed to write config: {}", e)))?;
            
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
        
        println!("Clustered {} vectors using Gaussian Mixture and updated files", vector_data.len());
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