use crate::core::SessionManager;
use crate::error::{FontResult, FontError};
use serde::{Serialize, Deserialize};
use smartcore::ensemble::random_forest_classifier::*;
use smartcore::linalg::basic::matrix::DenseMatrix;
use std::fs;
use futures::stream::{self, StreamExt};

// Random Forest training configuration constants
const RF_N_TREES: u16 = 100;           // Number of trees in the forest (default: 10)
const RF_MAX_DEPTH: u16 = 10;          // Maximum depth of trees
const RF_MIN_SAMPLES_SPLIT: usize = 5;  // Minimum samples required to split a node (default: 2)
const RF_MIN_SAMPLES_LEAF: usize = 2;   // Minimum samples required at a leaf node (default: 1)

// Parallel processing configuration constants
const CONCURRENT_FONT_LIMIT: usize = 10; // Maximum concurrent font processing (Google API rate limiting)
const PROGRESS_REPORT_INTERVAL: usize = 50; // Report progress every N fonts

// 事前訓練済みモデルをバイナリに埋め込み
const PRETRAINED_MODEL: &[u8] = include_bytes!("../../assets/font_classifier.bin");

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum FontCategory {
    SansSerif = 0,
    Serif = 1,
    Handwriting = 2,
    Monospace = 3,
    Display = 4,
}

impl FontCategory {
    pub fn as_str(&self) -> &'static str {
        match self {
            FontCategory::SansSerif => "sans-serif",
            FontCategory::Serif => "serif", 
            FontCategory::Handwriting => "handwriting",
            FontCategory::Monospace => "monospace",
            FontCategory::Display => "display",
        }
    }
    
    pub fn from_google_category(category: &str) -> Self {
        match category {
            "sans-serif" => FontCategory::SansSerif,
            "serif" => FontCategory::Serif,
            "handwriting" => FontCategory::Handwriting,
            "monospace" => FontCategory::Monospace,
            "display" => FontCategory::Display,
            _ => FontCategory::SansSerif, // デフォルト
        }
    }
}

#[derive(Serialize, Deserialize)]
pub struct FontClassifier {
    model: Option<RandomForestClassifier<f32, u32, DenseMatrix<f32>, Vec<u32>>>,
}

#[derive(Debug, Clone)]
pub struct TrainingSample {
    features: Vec<f32>,
    category: FontCategory,
}

#[derive(Deserialize)]
struct GoogleFontItem {
    family: String,
    category: String,
}

#[derive(Deserialize)]
struct GoogleFontsResponse {
    items: Vec<GoogleFontItem>,
}

impl FontClassifier {
    pub fn new() -> Self {
        Self { model: None }
    }
    
    // 事前訓練済みモデルを読み込み
    pub fn load_pretrained() -> FontResult<Self> {
        if PRETRAINED_MODEL.is_empty() {
            return Err(FontError::Classification("No pretrained model available".to_string()));
        }
        
        let model: RandomForestClassifier<f32, u32, DenseMatrix<f32>, Vec<u32>> = bincode::deserialize(PRETRAINED_MODEL)
            .map_err(|e| FontError::Classification(format!("Failed to load pretrained model: {}", e)))?;
        
        Ok(Self {
            model: Some(model),
        })
    }
    
    // モデルをファイルに保存
    pub fn save_model(&self, path: &str) -> FontResult<()> {
        if let Some(ref model) = self.model {
            let encoded = bincode::serialize(model)
                .map_err(|e| FontError::Classification(format!("Serialization failed: {}", e)))?;
            
            fs::write(path, encoded)
                .map_err(|e| FontError::Classification(format!("File write failed: {}", e)))?;
            
            println!("Model saved to: {}", path);
        }
        Ok(())
    }
    
    // モデルをファイルから読み込み
    pub fn load_model(path: &str) -> FontResult<Self> {
        let data = fs::read(path)
            .map_err(|e| FontError::Classification(format!("File read failed: {}", e)))?;
        
        let model: RandomForestClassifier<f32, u32, DenseMatrix<f32>, Vec<u32>> = bincode::deserialize(&data)
            .map_err(|e| FontError::Classification(format!("Deserialization failed: {}", e)))?;
        
        Ok(Self {
            model: Some(model),
        })
    }
    
    // フォントを分類
    pub async fn classify_font(&self, font_name: &str) -> FontResult<i32> {
        let model = self.model.as_ref()
            .ok_or(FontError::Classification("Model not trained".to_string()))?;
            
        // フォントの特徴量を取得（既存の圧縮ベクトルを使用）
        let features = match self.load_font_features(font_name).await {
            Ok(f) => f,
            Err(_) => return Ok(-1), // Unknown if features can't be loaded
        };
        
        let x = DenseMatrix::from_2d_vec(&vec![features]);
        
        // 予測実行
        let prediction = match model.predict(&x) {
            Ok(p) => p,
            Err(_) => return Ok(-1), // Unknown if prediction fails
        };
            
        // カテゴリに変換
        match prediction[0] {
            0 => Ok(0), // SansSerif
            1 => Ok(1), // Serif
            2 => Ok(2), // Handwriting
            3 => Ok(3), // Monospace
            4 => Ok(4), // Display
            _ => Ok(-1), // Unknown category
        }
    }
    
    // フォントの特徴量を読み込み（HOG特徴量を使用）
    async fn load_font_features(&self, font_name: &str) -> FontResult<Vec<f32>> {
        let session_manager = SessionManager::global();
        let vector_file = session_manager
            .get_font_directory(font_name)
            .join("vector.csv");
            
        let content = fs::read_to_string(vector_file)
            .map_err(|e| FontError::Classification(format!("Failed to read HOG vector file: {}", e)))?;
            
        let features: Vec<f32> = content
            .trim()
            .split(',')
            .map(str::parse)
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| FontError::Classification(format!("Failed to parse HOG features: {}", e)))?;
            
        if features.is_empty() {
            return Err(FontError::Classification("Empty feature vector".to_string()));
        }
            
        Ok(features)
    }
    
    // Google Fonts APIから訓練データを収集
    pub async fn fetch_training_data() -> FontResult<Vec<TrainingSample>> {
        let api_key = std::env::var("GOOGLE_FONTS_API_KEY")
            .map_err(|_| FontError::Classification("GOOGLE_FONTS_API_KEY not set".to_string()))?;
            
        let client = reqwest::Client::new();
        let url = format!("https://www.googleapis.com/webfonts/v1/webfonts?key={}", api_key);
        let response = client
            .get(&url)
            .send()
            .await
            .map_err(|e| FontError::Classification(format!("API request failed: {}", e)))?;
            
        // Debug: Check response status and body
        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
            return Err(FontError::Classification(format!("API error {}: {}", status, error_text)));
        }
        
        let response_text = response.text().await
            .map_err(|e| FontError::Classification(format!("Failed to read response: {}", e)))?;
            
        println!("API Response preview: {}", &response_text[..std::cmp::min(500, response_text.len())]);
        
        let google_fonts: GoogleFontsResponse = serde_json::from_str(&response_text)
            .map_err(|e| FontError::Classification(format!("JSON parsing failed: {}", e)))?;
            
        println!("Fetched {} fonts from Google Fonts API", google_fonts.items.len());
        
        // Create font renderer with Google Fonts support
        use crate::rendering::font_renderer::FontRenderer;
        use crate::core::vectorizer::ImageVectorizer;
        use crate::config::FontImageConfig;
        
        let temp_config = FontImageConfig {
            font_size: 64.0,
            text: "A quick brown fox jumps over the lazy dog".to_string(),
            output_dir: std::path::PathBuf::from("/tmp"),
        };
        
        let renderer = FontRenderer::with_google_fonts(&temp_config, api_key.clone());
        let vectorizer = ImageVectorizer::new();
        
        println!("🚀 Starting parallel font processing with {} concurrent workers...", CONCURRENT_FONT_LIMIT);
        let total_fonts = google_fonts.items.len();
        
        // Parallel processing using futures::stream
        let results = stream::iter(google_fonts.items)
            .enumerate()
            .map(|(index, font_item)| {
                let renderer = renderer.clone();
                let vectorizer = vectorizer.clone();
                let font_family = font_item.family.clone();
                let category_str = font_item.category.clone();
                
                async move {
                    // Progress reporting
                    if (index + 1) % PROGRESS_REPORT_INTERVAL == 0 {
                        println!("📊 Processing font {}/{}: {}", index + 1, total_fonts, font_family);
                    }
                    
                    // Try to render actual font and extract real features
                    match renderer.generate_training_image(&font_family).await {
                        Ok(image_bytes) => {
                            match vectorizer.vectorize_image_bytes(&image_bytes) {
                                Ok(features) => {
                                    let category = FontCategory::from_google_category(&category_str);
                                    Ok(TrainingSample {
                                        features,
                                        category,
                                    })
                                }
                                Err(e) => {
                                    println!("⚠ Skipping {}: Failed to vectorize image - {}", font_family, e);
                                    Err(e)
                                }
                            }
                        }
                        Err(e) => {
                            println!("⚠ Skipping {}: Failed to render font - {}", font_family, e);
                            Err(e)
                        }
                    }
                }
            })
            .buffer_unordered(CONCURRENT_FONT_LIMIT)
            .collect::<Vec<_>>()
            .await;
        
        // Process results
        let mut training_samples = Vec::new();
        let mut successful_renders = 0;
        let mut skipped_fonts = 0;
        
        for result in results {
            match result {
                Ok(sample) => {
                    training_samples.push(sample);
                    successful_renders += 1;
                }
                Err(_) => {
                    skipped_fonts += 1;
                }
            }
        }
        
        println!("Training data collection completed:");
        println!("  ✓ Successfully processed: {} fonts", successful_renders);
        println!("  ⚠ Skipped: {} fonts", skipped_fonts);
        println!("  📊 Success rate: {:.1}%", 
                (successful_renders as f32 / (successful_renders + skipped_fonts) as f32) * 100.0);
        
        if training_samples.is_empty() {
            return Err(FontError::Classification("No valid training samples generated".to_string()));
        }
        
        Ok(training_samples)
    }
    
    
    // モデルを訓練
    pub async fn train_model(&mut self, training_data: Vec<TrainingSample>) -> FontResult<()> {
        if training_data.is_empty() {
            return Err(FontError::Classification("No training data provided".to_string()));
        }
        
        println!("Training model with {} samples...", training_data.len());
        
        // 特徴量行列を構築
        let features: Vec<Vec<f32>> = training_data
            .iter()
            .map(|sample| sample.features.clone())
            .collect();
            
        let x = DenseMatrix::from_2d_vec(&features);
        
        // ラベルベクトルを構築
        let y: Vec<u32> = training_data
            .iter()
            .map(|sample| sample.category.clone() as u32)
            .collect();
            
        // Random Forestを訓練（カスタム設定を使用）
        let rf_params = RandomForestClassifierParameters::default()
            .with_n_trees(RF_N_TREES)
            .with_max_depth(RF_MAX_DEPTH)
            .with_min_samples_split(RF_MIN_SAMPLES_SPLIT)
            .with_min_samples_leaf(RF_MIN_SAMPLES_LEAF);
            
        println!("Training Random Forest with {} trees, max_depth: {}, min_samples_split: {}, min_samples_leaf: {}", 
                RF_N_TREES, RF_MAX_DEPTH, RF_MIN_SAMPLES_SPLIT, RF_MIN_SAMPLES_LEAF);
                
        let model = RandomForestClassifier::fit(&x, &y, rf_params)
            .map_err(|e| FontError::Classification(format!("Training failed: {}", e)))?;
            
        self.model = Some(model);
        println!("Model training completed successfully!");
        
        Ok(())
    }
    
    // 訓練データの統計を表示
    pub fn print_training_stats(training_data: &[TrainingSample]) {
        let mut category_counts = std::collections::HashMap::new();
        
        for sample in training_data {
            *category_counts.entry(sample.category.as_str()).or_insert(0) += 1;
        }
        
        println!("Training data distribution:");
        for (category, count) in category_counts {
            println!("  {}: {} samples", category, count);
        }
    }
    
    // 完全な訓練プロセスを実行
    pub async fn full_training_process() -> FontResult<Self> {
        println!("Starting full training process...");
        
        // 1. Google Fonts APIからデータを取得
        let training_data = Self::fetch_training_data().await?;
        Self::print_training_stats(&training_data);
        
        // 2. モデルを訓練
        let mut classifier = Self::new();
        classifier.train_model(training_data).await?;
        
        // 3. モデルを保存
        classifier.save_model("assets/font_classifier.bin")?;
        
        println!("Full training process completed!");
        Ok(classifier)
    }
    
}