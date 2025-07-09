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
use tokio::task;
use futures::future::join_all;

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
            font_families.extend(families.iter().map(|f| f.to_string()));
        }
        Err(_) => {
            return Vec::new();
        }
    }
    
    let mut fonts: Vec<String> = font_families.into_iter().collect();
    fonts.sort();
    fonts.dedup();
    fonts
}

const PREVIEW_TEXT: &str = "A quick brown fox jumps over the lazy dog";
const FONT_SIZE: f32 = 64.0;

struct FontImageConfig {
    text: String,
    font_size: f32,
    output_dir: PathBuf,
}

struct FontProcessingResult {
    family_name: String,
    result: Result<(), String>,
}

#[tauri::command]
async fn generate_font_images() -> Result<String, String> {
    let config = FontImageConfig {
        text: PREVIEW_TEXT.to_string(),
        font_size: FONT_SIZE,
        output_dir: create_output_directory()?,
    };
    
    let font_families = get_system_fonts();
    let total_fonts = font_families.len();
    
    let tasks = spawn_font_processing_tasks(font_families, &config);
    let results = join_all(tasks).await;
    
    process_font_results(results, total_fonts, &config).await;
    
    Ok(format!("Font images generated in: {}", config.output_dir.display()))
}

fn create_output_directory() -> Result<PathBuf, String> {
    let app_data_dir = dirs::data_dir()
        .ok_or("Failed to get app data directory")?
        .join("FontCluster");
    
    fs::create_dir_all(&app_data_dir)
        .map_err(|e| format!("Failed to create directory: {}", e))?;
    
    Ok(app_data_dir)
}

fn spawn_font_processing_tasks(
    font_families: Vec<String>,
    config: &FontImageConfig,
) -> Vec<task::JoinHandle<FontProcessingResult>> {
    font_families
        .into_iter()
        .map(|family_name| {
            let family_name_clone = family_name.clone();
            let config_clone = FontImageConfig {
                text: config.text.clone(),
                font_size: config.font_size,
                output_dir: config.output_dir.clone(),
            };
            
            task::spawn_blocking(move || {
                let source = SystemSource::new();
                let result = generate_font_image(
                    &source,
                    &family_name_clone,
                    &config_clone.text,
                    config_clone.font_size,
                    &config_clone.output_dir,
                );
                FontProcessingResult {
                    family_name: family_name_clone,
                    result,
                }
            })
        })
        .collect()
}

async fn process_font_results(
    results: Vec<Result<FontProcessingResult, task::JoinError>>,
    total_fonts: usize,
    config: &FontImageConfig,
) {
    let mut processed = 0;
    
    for result in results {
        match result {
            Ok(FontProcessingResult { family_name, result: Ok(_) }) => {
                processed += 1;
                println!("Generated font image for {}: {}/{}", family_name, processed, total_fonts);
            }
            Ok(FontProcessingResult { family_name, result: Err(e) }) => {
                eprintln!("Failed to generate image for {}: {}", family_name, e);
                handle_font_fallback(&family_name, config).await;
                processed += 1;
            }
            Err(e) => {
                eprintln!("Task failed: {}", e);
                processed += 1;
            }
        }
    }
}

async fn handle_font_fallback(family_name: &str, config: &FontImageConfig) {
    let config_clone = FontImageConfig {
        text: config.text.clone(),
        font_size: config.font_size,
        output_dir: config.output_dir.clone(),
    };
    
    let fallback_result = task::spawn_blocking(move || {
        let source = SystemSource::new();
        generate_font_image(
            &source,
            "sans-serif",
            &config_clone.text,
            config_clone.font_size,
            &config_clone.output_dir,
        )
    }).await;
    
    if let Ok(Err(fallback_err)) = fallback_result {
        eprintln!("Fallback failed for {}: {}", family_name, fallback_err);
    }
}

type GlyphData = (font_kit::loaders::default::Font, Vec<(u32, i32, i32)>, Vector2I);

fn generate_font_image(
    source: &SystemSource,
    family_name: &str,
    text: &str,
    font_size: f32,
    output_dir: &PathBuf,
) -> Result<(), String> {
    let font = load_font(source, family_name)?;
    let (font, glyph_data, canvas_size) = prepare_glyph_data(font, text, font_size)?;
    let canvas = render_glyphs_to_canvas(font, glyph_data, canvas_size, font_size)?;
    let img_buffer = convert_canvas_to_image(canvas, canvas_size);
    save_image(img_buffer, family_name, output_dir)?;
    
    Ok(())
}

fn load_font(source: &SystemSource, family_name: &str) -> Result<font_kit::loaders::default::Font, String> {
    source
        .select_best_match(&[FamilyName::Title(family_name.to_string())], &Properties::new())
        .map_err(|e| format!("Failed to select font: {}", e))?
        .load()
        .map_err(|e| format!("Failed to load font: {}", e))
}

fn prepare_glyph_data(
    font: font_kit::loaders::default::Font,
    text: &str,
    font_size: f32,
) -> Result<GlyphData, String> {
    let mut total_width = 0;
    let mut glyph_data = Vec::new();
    let metrics = font.metrics();
    
    // Track the actual bounds of all glyphs
    let mut min_y = f32::MAX;
    let mut max_y = f32::MIN;
    
    for ch in text.chars() {
        if let Some(glyph_id) = font.glyph_for_char(ch) {
            // Use accurate glyph width from advance metrics
            let advance = font.advance(glyph_id)
                .map_err(|e| format!("Failed to get glyph advance: {}", e))?;
            
            // Get actual glyph bounds using typographic_bounds
            let bounds = font.typographic_bounds(glyph_id)
                .map_err(|e| format!("Failed to get glyph bounds: {}", e))?;
            
            // Convert from font units to pixel units
            let glyph_width = (advance.x() * font_size / metrics.units_per_em as f32) as i32;
            
            // Track min and max Y bounds across all glyphs
            let scaled_min_y = bounds.min_y() * font_size / metrics.units_per_em as f32;
            let scaled_max_y = bounds.max_y() * font_size / metrics.units_per_em as f32;
            
            min_y = min_y.min(scaled_min_y);
            max_y = max_y.max(scaled_max_y);
            
            glyph_data.push((glyph_id, glyph_width, 0)); // Height will be calculated later
            total_width += glyph_width;
        }
    }
    
    if glyph_data.is_empty() {
        return Err("No glyphs found for text".to_string());
    }
    
    // Calculate actual height from glyph bounds with padding
    const PADDING: f32 = 4.0; // Add padding to prevent overflow
    let actual_height = (max_y - min_y + 2.0 * PADDING) as i32;
    
    // Update glyph data with actual height
    for (_, _, height) in &mut glyph_data {
        *height = actual_height;
    }
    
    let canvas_size = Vector2I::new(total_width, actual_height);
    Ok((font, glyph_data, canvas_size))
}

fn render_glyphs_to_canvas(
    font: font_kit::loaders::default::Font,
    glyph_data: Vec<(u32, i32, i32)>,
    canvas_size: Vector2I,
    font_size: f32,
) -> Result<Canvas, String> {
    let mut canvas = Canvas::new(canvas_size, Format::A8);
    let mut x_offset = 0;
    let metrics = font.metrics();
    
    // Calculate actual bounds to determine proper baseline
    let mut min_y = f32::MAX;
    let mut max_y = f32::MIN;
    
    for &(glyph_id, _, _) in &glyph_data {
        if let Ok(bounds) = font.typographic_bounds(glyph_id) {
            let scaled_min_y = bounds.min_y() * font_size / metrics.units_per_em as f32;
            let scaled_max_y = bounds.max_y() * font_size / metrics.units_per_em as f32;
            
            min_y = min_y.min(scaled_min_y);
            max_y = max_y.max(scaled_max_y);
        }
    }
    
    // Calculate baseline position with padding
    const PADDING: f32 = 4.0;
    let baseline_y = max_y + PADDING;
    
    for (glyph_id, glyph_width, _) in glyph_data {
        let transform = Transform2F::from_translation(
            Vector2F::new(x_offset as f32, baseline_y)
        );
        
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
    
    Ok(canvas)
}

fn convert_canvas_to_image(canvas: Canvas, canvas_size: Vector2I) -> ImageBuffer<Rgba<u8>, Vec<u8>> {
    let canvas_data = canvas.pixels;
    let mut img_buffer = ImageBuffer::new(canvas_size.x() as u32, canvas_size.y() as u32);
    
    for (i, &pixel) in canvas_data.iter().enumerate() {
        let x = i as u32 % canvas_size.x() as u32;
        let y = i as u32 / canvas_size.x() as u32;
        img_buffer.put_pixel(x, y, Rgba([pixel, pixel, pixel, 255]));
    }
    
    img_buffer
}

fn save_image(
    img_buffer: ImageBuffer<Rgba<u8>, Vec<u8>>,
    family_name: &str,
    output_dir: &PathBuf,
) -> Result<(), String> {
    let safe_name = family_name.replace(" ", "_").replace("/", "_");
    let output_path = output_dir.join(format!("{}.png", safe_name));
    
    img_buffer
        .save(&output_path)
        .map_err(|e| format!("Failed to save image: {}", e))?;
    
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
