use font_kit::source::SystemSource;
use font_kit::family_name::FamilyName;
use font_kit::properties::Properties;
use font_kit::hinting::HintingOptions;
use font_kit::canvas::{Canvas, Format, RasterizationOptions};
use std::collections::HashSet;
use image::{ImageBuffer, Luma};
use pathfinder_geometry::vector::Vector2F;
use pathfinder_geometry::vector::Vector2I;
use pathfinder_geometry::transform2d::Transform2F;

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
fn generate_font_preview(font_family: &str) -> Result<String, String> {
    let source = SystemSource::new();
    
    // Get the font family
    let family_name = FamilyName::Title(font_family.to_string());
    let font_handle = source
        .select_best_match(&[family_name], &Properties::new())
        .map_err(|e| format!("Failed to find font: {}", e))?;
    
    // Load the font
    let font = font_handle
        .load()
        .map_err(|e| format!("Failed to load font: {}", e))?;
    
    // Create canvas
    let canvas_size = Vector2I::new(300, 60);
    let mut canvas = Canvas::new(canvas_size, Format::A8);
    
    // Get glyph IDs for the font family name
    let glyph_ids: Vec<u32> = font_family.chars()
        .filter_map(|c| font.glyph_for_char(c))
        .collect();
    
    if glyph_ids.is_empty() {
        return Err("No glyphs found for font family name".to_string());
    }
    
    // Set up rasterization options
    let font_size = 32.0;
    let transform = Transform2F::from_scale(Vector2F::splat(font_size));
    let hinting_options = HintingOptions::None;
    let rasterization_options = RasterizationOptions::GrayscaleAa;
    
    // Position for drawing
    let mut x_offset = 10.0;
    let y_offset = 40.0;
    
    // Rasterize each glyph
    for glyph_id in glyph_ids {
        let glyph_bounds = font.typographic_bounds(glyph_id)
            .map_err(|e| format!("Failed to get glyph bounds: {}", e))?;
        
        // Create transform for this glyph
        let glyph_transform = transform * Transform2F::from_translation(Vector2F::new(x_offset, y_offset));
        
        // Rasterize the glyph
        font.rasterize_glyph(
            &mut canvas,
            glyph_id,
            font_size,
            glyph_transform,
            hinting_options,
            rasterization_options,
        ).map_err(|e| format!("Failed to rasterize glyph: {}", e))?;
        
        // Move to next position
        x_offset += glyph_bounds.width() * font_size + 2.0;
        
        // Break if we exceed canvas width
        if x_offset > 280.0 {
            break;
        }
    }
    
    // Convert canvas to image
    let canvas_data = canvas.pixels;
    let width = canvas_size.x() as u32;
    let height = canvas_size.y() as u32;
    
    // Create image buffer from canvas data
    let mut image_buffer = ImageBuffer::new(width, height);
    
    for (i, &pixel) in canvas_data.iter().enumerate() {
        let x = (i as u32) % width;
        let y = (i as u32) / width;
        if x < width && y < height {
            // Convert from alpha to grayscale (invert for proper text rendering)
            let gray_value = 255 - pixel;
            image_buffer.put_pixel(x, y, Luma([gray_value]));
        }
    }
    
    // Convert to PNG and base64
    let mut buffer = Vec::new();
    image_buffer.write_to(&mut std::io::Cursor::new(&mut buffer), image::ImageOutputFormat::Png)
        .map_err(|e| format!("Failed to encode image: {}", e))?;
    
    let base64_string = base64::encode(&buffer);
    Ok(format!("data:image/png;base64,{}", base64_string))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![greet, get_system_fonts, generate_font_preview])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
