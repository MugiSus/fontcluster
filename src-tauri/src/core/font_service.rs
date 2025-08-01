use crate::error::FontResult;
use crate::core::SessionManager;
use font_kit::source::SystemSource;
use font_kit::family_name::FamilyName;
use font_kit::properties::{Properties, Weight};
use std::collections::HashSet;
use std::path::PathBuf;
use std::fs;
use std::sync::Arc;

/// Represents a validated font-weight pair that is guaranteed to work
#[derive(Debug, Clone)]
pub struct FontWeightPair {
    pub family_name: String,
    pub requested_weight: i32,
    pub actual_weight: i32,
}

// Service layer for font operations
pub struct FontService;

impl FontService {
    /// Returns a list of system fonts, excluding symbol fonts and noise fonts
    pub fn get_system_fonts_with_source(source: &SystemSource) -> Vec<String> {
        source
            .all_families()
            .map(|families| {
                let mut fonts: Vec<String> = families.into_iter()
                    .map(|f| f.to_string())
                    .filter(|font_name| Self::is_regular_font(font_name))
                    .collect::<HashSet<_>>()
                    .into_iter()
                    .collect();
                fonts.sort();
                fonts
            })
            .unwrap_or_default()
    }
    
    /// Returns a list of system fonts, excluding symbol fonts and noise fonts
    pub fn get_system_fonts() -> Vec<String> {
        let source = SystemSource::new();
        Self::get_system_fonts_with_source(&source)
    }
    
    /// Returns validated font-weight pairs that are guaranteed to work
    pub async fn get_validated_font_weight_pairs(source: Arc<SystemSource>, weights: &[i32]) -> Vec<FontWeightPair> {
        use tokio::task;
        use futures::future::join_all;
        use std::sync::Arc;
        use tokio::sync::Semaphore;
        
        println!("🔍 Pre-resolving font-weight pairs for weights: {:?}", weights);
        let start_time = std::time::Instant::now();
        
        let all_families = source.all_families().unwrap_or_default();
        let total_families = all_families.len();
        println!("📊 Total font families found: {}", total_families);
        
        // Pre-filter regular fonts to reduce work
        let regular_families: Vec<String> = all_families
            .into_iter()
            .filter(|family_name| Self::is_regular_font(family_name))
            .collect();
        
        println!("📊 Regular font families after filtering: {}", regular_families.len());
        
        // Generate all font-weight combinations for parallel processing
        let mut font_weight_combinations = Vec::new();
        for family_name in &regular_families {
            for &weight_value in weights {
                font_weight_combinations.push((family_name.clone(), weight_value));
            }
        }
        
        let total_tasks = font_weight_combinations.len();
        println!("🔄 Processing {} font-weight combinations", total_tasks);
        
        if font_weight_combinations.is_empty() {
            return Vec::new();
        }
        
        // Process combinations in batches like image_generator
        const BATCH_SIZE: usize = 128; // Same as image_generator
        let shared_source = source;
        let semaphore = Arc::new(Semaphore::new(16)); // Same as image_generator
        
        let total_batches = (total_tasks + BATCH_SIZE - 1) / BATCH_SIZE;
        println!("🚀 Processing {} font-weight combinations in {} batches", 
                total_tasks, total_batches);
        
        let mut all_validated_pairs = Vec::new();
        
        // Process combinations in chunks
        for (batch_idx, combination_chunk) in font_weight_combinations.chunks(BATCH_SIZE).enumerate() {
            let batch_tasks: Vec<_> = combination_chunk.iter()
                .map(|(family_name, weight_value)| {
                    let shared_source = Arc::clone(&shared_source);
                    let semaphore = Arc::clone(&semaphore);
                    let family_name = family_name.clone();
                    let weight_value = *weight_value;
                    
                    task::spawn_blocking(move || {
                        // Acquire permit before processing (blocking)
                        let rt = tokio::runtime::Handle::current();
                        let _permit = rt.block_on(semaphore.acquire()).unwrap();
                        
                        if let Some(actual_weight) = Self::validate_font_weight(&shared_source, &family_name, weight_value) {
                            Some(FontWeightPair {
                                family_name,
                                requested_weight: weight_value,
                                actual_weight,
                            })
                        } else {
                            None
                        }
                    })
                })
                .collect();
            
            println!("🔄 Processing batch {}/{} ({} tasks)", batch_idx + 1, total_batches, batch_tasks.len());
            
            // Wait for this batch to complete before starting the next
            let batch_results = join_all(batch_tasks).await;
            let batch_pairs: Vec<FontWeightPair> = batch_results
                .into_iter()
                .filter_map(|result| result.unwrap())
                .collect();
            
            all_validated_pairs.extend(batch_pairs);
        }
        
        let elapsed = start_time.elapsed();
        println!("✅ Pre-validation completed in {:.2}ms: {} valid font-weight pairs from {} families", 
                elapsed.as_millis(), all_validated_pairs.len(), total_families);
        
        // Sort by family name for consistent ordering
        all_validated_pairs.sort_by(|a, b| a.family_name.cmp(&b.family_name));
        all_validated_pairs
    }
    
    /// Validate that a font family supports a specific weight and return the actual weight
    fn validate_font_weight(source: &SystemSource, family_name: &str, weight_value: i32) -> Option<i32> {
        let properties = Properties {
            weight: Weight(weight_value as f32),
            ..Default::default()
        };
        
        // Try to select and load the font
        if let Ok(handle) = source.select_best_match(
            &[FamilyName::Title(family_name.to_string())], 
            &properties
        ) {
            if let Ok(font) = handle.load() {
                let actual_weight = font.properties().weight.0 as i32;
                let weight_diff = (actual_weight - weight_value).abs();
                
                // Accept if weight difference is reasonable
                if weight_diff <= 50 {
                    return Some(actual_weight);
                }
            }
        }
        
        None
    }
    
    
    /// Filters out symbol fonts, dingbats, and other noise fonts
    fn is_regular_font(font_name: &str) -> bool {
        let font_lower = font_name.to_lowercase();
        
        // List of font patterns to exclude (minimal list to avoid excluding useful fonts)
        let excluded_patterns = [
            "wingdings",
            "webdings",
            "dingbats", 
            "emoji",
            "font awesome",
            "bodoni ornaments"
        ];
        
        // Check if font name contains any excluded patterns
        for pattern in &excluded_patterns {
            if font_lower.contains(pattern) {
                return false;
            }
        }
        
        true
    }
    
    pub fn create_output_directory() -> FontResult<PathBuf> {
        Ok(SessionManager::global().get_session_dir())
    }
    
    
    pub fn read_compressed_vectors() -> FontResult<String> {
        let session_manager = SessionManager::global();
        let session_dir = session_manager.get_session_dir();
        Self::read_compressed_vectors_for_session(session_dir)
    }
    
    fn load_font_config_from_path(config_path: &PathBuf) -> FontResult<Option<crate::config::FontConfig>> {
        use std::fs;
        use serde_json;
        
        if !config_path.exists() {
            return Ok(None);
        }
        
        let content = fs::read_to_string(config_path)?;
        let config: crate::config::FontConfig = serde_json::from_str(&content)
            .map_err(|e| crate::error::FontError::Io(std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                format!("Failed to parse font config: {}", e)
            )))?;
        
        Ok(Some(config))
    }
    
    pub fn read_compressed_vectors_for_session(session_dir: PathBuf) -> FontResult<String> {
        
        let mut result = serde_json::Map::new();
        
        for entry in fs::read_dir(&session_dir)? {
            let entry = entry?;
            if !entry.path().is_dir() {
                continue;
            }
            
            let font_dir = entry.path();
            let _safe_font_name = match font_dir.file_name().and_then(|n| n.to_str()) {
                Some(name) => name,
                None => continue,
            };
            
            // Load font config directly from the font directory
            let config_path = font_dir.join("config.json");
            let config = match Self::load_font_config_from_path(&config_path) {
                Ok(Some(config)) => config,
                Ok(None) => continue,
                Err(_) => continue,
            };
            
            // Load compressed vector
            let compressed_vector_path = font_dir.join("compressed-vector.csv");
            if !compressed_vector_path.exists() {
                continue;
            }
            
            let content = match fs::read_to_string(&compressed_vector_path) {
                Ok(content) => content,
                Err(e) => {
                    eprintln!("Failed to read file {}: {}", compressed_vector_path.display(), e);
                    continue;
                }
            };
            
            if let Some((x, y, k)) = Self::parse_compressed_vector_line(&content) {
                // Use font_name as key, store vector coordinates and config
                result.insert(
                    config.font_name.clone(),
                    serde_json::json!({
                        "x": x,
                        "y": y,
                        "k": k,
                        "config": config
                    })
                );
            }
        }
        
        serde_json::to_string(&result)
            .map_err(|e| crate::error::FontError::Io(std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                format!("Failed to serialize compressed vectors: {}", e)
            )))
    }
    
    fn parse_compressed_vector_line(content: &str) -> Option<(f64, f64, i32)> {
        let mut values = content.trim().split(',');
        let x = values.next()?.parse().ok()?;
        let y = values.next()?.parse().ok()?;
        let k = values.next()?.parse().ok()?;
        Some((x, y, k))
    }
}