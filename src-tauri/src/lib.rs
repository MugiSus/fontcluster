use font_kit::source::SystemSource;
use font_kit::family_name::FamilyName;
use font_kit::properties::Properties;
use font_kit::hinting::HintingOptions;
use font_kit::canvas::{Canvas, Format, RasterizationOptions};
use font_kit::font::Font;
use std::collections::HashSet;
use std::path::Path;
use std::fs;
use image::{ImageBuffer, Luma};
use pathfinder_geometry::vector::Vector2F;
use pathfinder_geometry::vector::Vector2I;
use pathfinder_geometry::transform2d::Transform2F;

type FontResult<T> = Result<T, String>;

// Font loading utilities
fn load_font(font_family: &str) -> FontResult<Font> {
    println!("Loading font: {}", font_family);
    
    let source = SystemSource::new();
    let family_name = FamilyName::Title(font_family.to_string());
    
    let font_handle = source
        .select_best_match(&[family_name], &Properties::new())
        .map_err(|e| format!("Failed to find font '{}': {}", font_family, e))?;
    
    let font = font_handle
        .load()
        .map_err(|e| format!("Failed to load font '{}': {}", font_family, e))?;
    
    println!("Successfully loaded font: {}", font_family);
    Ok(font)
}

fn get_glyph_ids(font: &Font, text: &str) -> FontResult<Vec<u32>> {
    let glyph_ids: Vec<u32> = text.chars()
        .filter_map(|c| font.glyph_for_char(c))
        .collect();
    
    if glyph_ids.is_empty() {
        return Err(format!("No glyphs found for text: {}", text));
    }
    
    println!("Found {} glyphs for text: {}", glyph_ids.len(), text);
    Ok(glyph_ids)
}

// Canvas utilities
fn create_canvas(width: i32, height: i32) -> Canvas {
    let canvas_size = Vector2I::new(width, height);
    let mut canvas = Canvas::new(canvas_size, Format::A8);
    canvas.pixels.fill(0); // Clear with transparent background
    canvas
}

fn rasterize_glyphs(
    canvas: &mut Canvas,
    font: &Font,
    glyph_ids: &[u32],
    font_size: f32,
    start_x: f32,
    baseline_y: f32,
) -> FontResult<()> {
    let hinting_options = HintingOptions::None;
    let rasterization_options = RasterizationOptions::GrayscaleAa;
    
    let mut x_offset = start_x;
    
    for (i, &glyph_id) in glyph_ids.iter().enumerate() {
        // Create transform for this glyph
        let glyph_transform = Transform2F::from_scale(Vector2F::splat(font_size))
            * Transform2F::from_translation(Vector2F::new(x_offset, baseline_y));
        
        println!("Rasterizing glyph {} at position ({}, {})", i, x_offset, baseline_y);
        
        // Rasterize the glyph
        font.rasterize_glyph(
            canvas,
            glyph_id,
            font_size,
            glyph_transform,
            hinting_options,
            rasterization_options,
        ).map_err(|e| format!("Failed to rasterize glyph {}: {}", i, e))?;
        
        // Move to next position
        let advance = font.advance(glyph_id).unwrap_or(Vector2F::new(font_size * 0.6, 0.0));
        x_offset += advance.x() + 2.0;
        
        // Break if we exceed canvas width
        if x_offset > 280.0 {
            break;
        }
    }
    
    Ok(())
}

// Image processing utilities
fn canvas_to_image(canvas: &Canvas, canvas_size: Vector2I) -> FontResult<ImageBuffer<Luma<u8>, Vec<u8>>> {
    let canvas_data = &canvas.pixels;
    let width = canvas_size.x() as u32;
    let height = canvas_size.y() as u32;
    
    println!("Canvas size: {}x{}, pixel count: {}", width, height, canvas_data.len());
    
    let mut image_buffer = ImageBuffer::new(width, height);
    
    for (i, &pixel) in canvas_data.iter().enumerate() {
        let x = (i as u32) % width;
        let y = (i as u32) / width;
        if x < width && y < height {
            // For A8 format, pixel is alpha value
            // Convert alpha to grayscale: 0 = transparent (white), 255 = opaque (black)
            let gray_value = if pixel > 0 { 255 - pixel } else { 255 };
            image_buffer.put_pixel(x, y, Luma([gray_value]));
        }
    }
    
    // Debug: Check if any pixels are not white
    let non_white_pixels = canvas_data.iter().filter(|&&p| p > 0).count();
    println!("Non-white pixels: {}", non_white_pixels);
    
    Ok(image_buffer)
}

fn save_image_to_file(image_buffer: &ImageBuffer<Luma<u8>, Vec<u8>>, font_family: &str) -> FontResult<()> {
    // Create generated directory if it doesn't exist
    let generated_dir = Path::new("generated");
    if !generated_dir.exists() {
        fs::create_dir_all(generated_dir)
            .map_err(|e| format!("Failed to create generated directory: {}", e))?;
    }
    
    // Save image to file
    let safe_filename = font_family.replace('/', "_").replace('\\', "_").replace(':', "_");
    let file_path = generated_dir.join(format!("{}.png", safe_filename));
    
    image_buffer.save(&file_path)
        .map_err(|e| format!("Failed to save image: {}", e))?;
    
    println!("Saved font preview to: {:?}", file_path);
    Ok(())
}

fn image_to_base64(image_buffer: &ImageBuffer<Luma<u8>, Vec<u8>>) -> FontResult<String> {
    let mut buffer = Vec::new();
    image_buffer.write_to(&mut std::io::Cursor::new(&mut buffer), image::ImageOutputFormat::Png)
        .map_err(|e| format!("Failed to encode image: {}", e))?;
    
    let base64_string = base64::encode(&buffer);
    Ok(format!("data:image/png;base64,{}", base64_string))
}

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
    
    fonts
}

#[tauri::command]
fn generate_font_preview(font_family: &str) -> FontResult<String> {
    println!("Starting font preview generation for: {}", font_family);
    
    // Load font
    let font = load_font(font_family)?;
    
    // Get glyph IDs for the font family name
    let glyph_ids = get_glyph_ids(&font, font_family)?;
    
    // Create canvas
    let canvas_size = Vector2I::new(300, 60);
    let mut canvas = create_canvas(canvas_size.x(), canvas_size.y());
    
    // Rasterize glyphs onto canvas
    rasterize_glyphs(&mut canvas, &font, &glyph_ids, 32.0, 10.0, 45.0)?;
    
    // Convert canvas to image
    let image_buffer = canvas_to_image(&canvas, canvas_size)?;
    
    // Save image to file
    save_image_to_file(&image_buffer, font_family)?;
    
    // Convert to base64 for web display
    image_to_base64(&image_buffer)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![greet, get_system_fonts, generate_font_preview])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
