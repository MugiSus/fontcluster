use fontcluster_lib::core::FontClassifier;
use std::env;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Load .env file
    dotenv::dotenv().ok();
    
    println!("🚀 Starting Google Fonts font classifier training...");
    
    // Google Fonts API キーの確認
    let api_key = env::var("GOOGLE_FONTS_API_KEY")
        .unwrap_or_else(|_| {
            println!("⚠️  Warning: GOOGLE_FONTS_API_KEY not set, using demo mode");
            "demo".to_string()
        });
    
    if api_key == "demo" {
        println!("📝 Demo mode: generating sample model...");
        let mut classifier = FontClassifier::new();
        let demo_data = FontClassifier::generate_demo_training_data();
        classifier.train_model(demo_data).await?;
        classifier.save_model("assets/font_classifier.bin")?;
        println!("✅ Demo model saved to assets/font_classifier.bin");
    } else {
        println!("📡 Fetching real Google Fonts data...");
        let _classifier = FontClassifier::full_training_process().await?;
        println!("✅ Real model saved to assets/font_classifier.bin");
    }
    
    println!("🎉 Training completed! You can now use the font classifier.");
    println!("💡 Next: Run your Tauri app and call classify_font(font_name)");
    
    Ok(())
}