use font_kit::source::SystemSource;
use font_kit::canvas::{Canvas, Format, RasterizationOptions};
use font_kit::family_name::FamilyName;
use font_kit::hinting::HintingOptions;
use font_kit::properties::Properties;
use pathfinder_geometry::transform2d::Transform2F;
use pathfinder_geometry::vector::{Vector2F, Vector2I};
use image::{ImageBuffer, Rgba};
use std::collections::HashSet;
use std::fs;
use std::path::PathBuf;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn get_system_fonts() -> Vec<String> {
    let source = SystemSource::new();
    let mut font_families = HashSet::new();
    
    match source.all_families() {
        Ok(families) => {
            for family in families {
                font_families.insert(family.to_string());
            }
        }
        Err(_) => {
            // Fallback: return empty vector if font-kit fails
            return Vec::new();
        }
    }
    
    let mut fonts: Vec<String> = font_families.into_iter().collect();
    fonts.sort();
    fonts.dedup();
    
    return fonts;
}

#[tauri::command]
fn generate_font_images() -> Result<String, String> {
    const PREVIEW_TEXT: &str = "A quick brown fox jumps over the lazy dog";
    const FONT_SIZE: f32 = 64.0;
    
    // Create output directory
    let app_data_dir = dirs::data_dir()
        .ok_or("Failed to get app data directory")?
        .join("FontCluster");
    
    fs::create_dir_all(&app_data_dir).map_err(|e| format!("Failed to create directory: {}", e))?;
    
    let source = SystemSource::new();
    let font_families = get_system_fonts();
    
    for family_name in font_families {
        match generate_font_image(&source, &family_name, PREVIEW_TEXT, FONT_SIZE, &app_data_dir) {
            Ok(_) => continue,
            Err(e) => {
                eprintln!("Failed to generate image for {}: {}", family_name, e);
                // Try fallback to sans-serif
                if let Err(fallback_err) = generate_font_image(&source, "sans-serif", PREVIEW_TEXT, FONT_SIZE, &app_data_dir) {
                    eprintln!("Fallback failed for {}: {}", family_name, fallback_err);
                }
            }
        }
    }
    
    Ok(format!("Font images generated in: {}", app_data_dir.display()))
}

fn generate_font_image(
    source: &SystemSource,
    family_name: &str,
    text: &str,
    font_size: f32,
    output_dir: &PathBuf,
) -> Result<(), String> {
    // Load font
    let font = source
        .select_best_match(&[FamilyName::Title(family_name.to_string())], &Properties::new())
        .map_err(|e| format!("Failed to select font: {}", e))?
        .load()
        .map_err(|e| format!("Failed to load font: {}", e))?;
    
    // Calculate canvas size
    let mut total_width = 0;
    let mut max_height = 0;
    let mut glyph_data = Vec::new();
    
    for ch in text.chars() {
        if let Some(glyph_id) = font.glyph_for_char(ch) {
            let metrics = font.metrics();
            let glyph_width = (font_size * 1.0) as i32; // Approximate width
            let glyph_height = (metrics.ascent - metrics.descent) as i32;
            
            glyph_data.push((glyph_id, glyph_width, glyph_height));
            total_width += glyph_width;
            max_height = max_height.max(glyph_height);
        }
    }
    
    if glyph_data.is_empty() {
        return Err("No glyphs found for text".to_string());
    }
    
    // Create canvas
    let canvas_size = Vector2I::new(total_width, max_height);
    let mut canvas = Canvas::new(canvas_size, Format::A8);
    
    // Render glyphs
    let mut x_offset = 0;
    for (glyph_id, glyph_width, _) in glyph_data {
        let transform = Transform2F::from_translation(Vector2F::new(x_offset as f32, max_height as f32 * 0.8));
        
        if let Err(e) = font.rasterize_glyph(
            &mut canvas,
            glyph_id,
            font_size,
            transform,
            HintingOptions::None,
            RasterizationOptions::GrayscaleAa,
        ) {
            eprintln!("Failed to rasterize glyph: {}", e);
        }
        
        x_offset += glyph_width;
    }
    
    // Convert canvas to PNG
    let canvas_data = canvas.pixels;
    let mut img_buffer = ImageBuffer::new(canvas_size.x() as u32, canvas_size.y() as u32);
    
    for (i, &pixel) in canvas_data.iter().enumerate() {
        let x = i as u32 % canvas_size.x() as u32;
        let y = i as u32 / canvas_size.x() as u32;
        img_buffer.put_pixel(x, y, Rgba([pixel, pixel, pixel, 255]));
    }
    
    // Save image
    let safe_name = family_name.replace(" ", "_").replace("/", "_");
    let output_path = output_dir.join(format!("{}.png", safe_name));
    img_buffer.save(&output_path).map_err(|e| format!("Failed to save image: {}", e))?;
    
    println!("Saved font image: {} -> {}", family_name, output_path.display());
    
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![greet, get_system_fonts, generate_font_images])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
