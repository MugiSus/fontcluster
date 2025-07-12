use fontcluster_lib::core::FontClassifier;
use std::env;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Load .env file
    dotenv::dotenv().ok();
    
    println!("🚀 Starting Google Fonts font classifier training...");
    
    // Google Fonts API キーの確認
    let _api_key = env::var("GOOGLE_FONTS_API_KEY")
        .map_err(|_| "GOOGLE_FONTS_API_KEY environment variable must be set for training")?;
    
    println!("📡 Fetching real Google Fonts data and rendering actual font images...");
    let _classifier = FontClassifier::full_training_process().await?;
    println!("✅ Real model saved to assets/font_classifier.bin");
    
    println!("🎉 Training completed! You can now use the font classifier.");
    println!("💡 Next: Run your Tauri app and call classify_font(font_name)");
    
    Ok(())
}