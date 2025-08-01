use crate::core::SkiaImageGenerator;
use crate::config::FONT_SIZE;
use crate::utils::with_text_or_default;
use tauri::{AppHandle, Emitter};

/// Generate font images using GPU-accelerated Skia rendering
#[tauri::command]
pub async fn generate_fonts_with_skia(
    text: Option<String>, 
    weights: Option<Vec<i32>>, 
    app_handle: AppHandle
) -> Result<String, String> {
    let processing_text = with_text_or_default("A quick brown fox jumps over the lazy dog")(text);
    let font_weights = weights.unwrap_or_else(|| vec![400]);
    
    #[cfg(feature = "gpu")]
    println!("🎨 Starting Skia GPU font generation with text: '{}' and weights: {:?}", processing_text, font_weights);
    #[cfg(not(feature = "gpu"))]
    println!("🎨 Starting Skia CPU font generation with text: '{}' and weights: {:?}", processing_text, font_weights);
    
    let generator = SkiaImageGenerator::new(Some(processing_text.clone()), FONT_SIZE, font_weights.clone())
        .map_err(|e| format!("Failed to create Skia generator: {}", e))?;
    
    match generator.generate_all(&app_handle).await {
        Ok(output_dir) => {
            #[cfg(feature = "gpu")]
            let result = format!(
                "🎉 Skia GPU font generation completed successfully!\n\
                📊 Results available in: {}\n\
                📝 Processed text: '{}'\n\
                ⚡ GPU-accelerated rendering with {} weights",
                output_dir.display(),
                processing_text,
                font_weights.len()
            );
            
            #[cfg(not(feature = "gpu"))]
            let result = format!(
                "🎉 Skia CPU font generation completed successfully!\n\
                📊 Results available in: {}\n\
                📝 Processed text: '{}'\n\
                🖥️  CPU-optimized rendering with {} weights",
                output_dir.display(),
                processing_text,
                font_weights.len()
            );
            
            // Emit completion event
            if let Err(e) = app_handle.emit("skia_generation_complete", &result) {
                println!("Warning: Failed to emit skia_generation_complete event: {}", e);
            }
            
            Ok(result)
        }
        Err(e) => Err(format!("Skia GPU font generation failed: {}", e))
    }
}

/// Compare performance between CPU and GPU rendering
#[tauri::command]
pub async fn benchmark_rendering_methods(
    text: Option<String>,
    weights: Option<Vec<i32>>,
    app_handle: AppHandle
) -> Result<String, String> {
    let processing_text = with_text_or_default("Benchmark Test")(text);
    let font_weights = weights.unwrap_or_else(|| vec![400]);
    
    println!("🏁 Starting rendering method benchmark");
    
    // Time Skia GPU rendering
    let start_time = std::time::Instant::now();
    let skia_generator = SkiaImageGenerator::new(Some(processing_text.clone()), FONT_SIZE, font_weights.clone())
        .map_err(|e| format!("Failed to create Skia generator: {}", e))?;
    
    skia_generator.generate_all(&app_handle).await
        .map_err(|e| format!("Skia rendering failed: {}", e))?;
    
    let skia_duration = start_time.elapsed();
    
    // Time traditional CPU rendering (for comparison)
    let start_time = std::time::Instant::now();
    let cpu_generator = crate::core::FontImageGenerator::new(Some(processing_text.clone()), FONT_SIZE, font_weights.clone())
        .map_err(|e| format!("Failed to create CPU generator: {}", e))?;
    
    cpu_generator.generate_all(&app_handle).await
        .map_err(|e| format!("CPU rendering failed: {}", e))?;
    
    let cpu_duration = start_time.elapsed();
    
    let speedup = cpu_duration.as_secs_f64() / skia_duration.as_secs_f64();
    
    let result = format!(
        "🏁 Rendering Benchmark Results:\n\
        ⚡ Skia GPU: {:.2}s\n\
        🖥️  CPU Traditional: {:.2}s\n\
        🚀 Speedup: {:.2}x\n\
        📊 Processed {} fonts with {} weights",
        skia_duration.as_secs_f64(),
        cpu_duration.as_secs_f64(),
        speedup,
        100, // Approximate font count
        font_weights.len()
    );
    
    println!("{}", result);
    Ok(result)
}