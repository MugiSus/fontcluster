use crate::core::SessionManager;
use crate::error::{FontResult, FontError};
use serde::{Serialize, Deserialize};
use smartcore::ensemble::random_forest_classifier::*;
use smartcore::linalg::basic::matrix::DenseMatrix;
use std::fs;

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
    pub async fn classify_font(&self, font_name: &str) -> FontResult<FontCategory> {
        let model = self.model.as_ref()
            .ok_or(FontError::Classification("Model not trained".to_string()))?;
            
        // フォントの特徴量を取得（既存の圧縮ベクトルを使用）
        let features = self.load_font_features(font_name).await?;
        let x = DenseMatrix::from_2d_vec(&vec![features]);
        
        // 予測実行
        let prediction = model.predict(&x)
            .map_err(|e| FontError::Classification(format!("Prediction failed: {}", e)))?;
            
        // カテゴリに変換
        match prediction[0] {
            0 => Ok(FontCategory::SansSerif),
            1 => Ok(FontCategory::Serif),
            2 => Ok(FontCategory::Handwriting),
            3 => Ok(FontCategory::Monospace),
            4 => Ok(FontCategory::Display),
            _ => Err(FontError::Classification("Unknown category".to_string())),
        }
    }
    
    // フォントの特徴量を読み込み（既存システムを活用）
    async fn load_font_features(&self, font_name: &str) -> FontResult<Vec<f32>> {
        let session_manager = SessionManager::global();
        let vector_file = session_manager
            .get_font_directory(font_name)
            .join("compressed-vector.csv");
            
        let content = fs::read_to_string(vector_file)
            .map_err(|e| FontError::Classification(format!("Failed to read vector file: {}", e)))?;
            
        let coords: Vec<f32> = content
            .trim()
            .split(',')
            .take(2)  // x, y座標のみ使用
            .map(str::parse)
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| FontError::Classification(format!("Failed to parse coordinates: {}", e)))?;
            
        if coords.len() < 2 {
            return Err(FontError::Classification("Insufficient coordinate data".to_string()));
        }
            
        Ok(coords)
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
        
        let mut training_samples = Vec::new();
        
        for font_item in google_fonts.items {
            // 実際の使用では、フォントファイルをダウンロードして特徴量を抽出する必要がある
            // ここでは簡略化したダミー特徴量を使用
            let features = Self::generate_dummy_features(&font_item.family);
            let category = FontCategory::from_google_category(&font_item.category);
            
            training_samples.push(TrainingSample {
                features,
                category,
            });
        }
        
        Ok(training_samples)
    }
    
    // ダミー特徴量生成（実際の実装では実際のフォント解析が必要）
    fn generate_dummy_features(font_name: &str) -> Vec<f32> {
        // フォント名のハッシュベースで一貫した特徴量を生成
        let hash = font_name.bytes().fold(0u32, |acc, b| acc.wrapping_mul(31).wrapping_add(b as u32));
        let x = ((hash % 1000) as f32 - 500.0) / 100.0;
        let y = (((hash / 1000) % 1000) as f32 - 500.0) / 100.0;
        vec![x, y]
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
            
        // Random Forestを訓練
        let model = RandomForestClassifier::fit(&x, &y, Default::default())
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
    
    // デモ用の訓練データ生成
    pub fn generate_demo_training_data() -> Vec<TrainingSample> {
        vec![
            TrainingSample {
                features: vec![-0.5, 0.2],
                category: FontCategory::SansSerif,
            },
            TrainingSample {
                features: vec![0.3, -0.4],
                category: FontCategory::Serif,
            },
            TrainingSample {
                features: vec![0.8, 0.6],
                category: FontCategory::Handwriting,
            },
            TrainingSample {
                features: vec![-0.2, -0.8],
                category: FontCategory::Monospace,
            },
            TrainingSample {
                features: vec![1.0, 0.1],
                category: FontCategory::Display,
            },
        ]
    }
}