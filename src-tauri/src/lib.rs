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
use tauri::Emitter;

// Error handling
type FontResult<T> = Result<T, FontError>;

#[derive(Debug, thiserror::Error)]
enum FontError {
    #[error("Font loading failed: {0}")]
    FontLoad(String),
    #[error("Image generation failed: {0}")]
    ImageGeneration(String),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Font selection failed: {0}")]
    FontSelection(String),
    #[error("Glyph processing failed: {0}")]
    GlyphProcessing(String),
}

// Tauri command handlers
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn get_system_fonts() -> Vec<String> {
    FontService::get_system_fonts()
}

// Constants
const PREVIEW_TEXT: &str = "A quick brown fox jumps over the lazy dog";
const FONT_SIZE: f32 = 96.0;
const GLYPH_PADDING: f32 = 4.0;

// Configuration structures
#[derive(Debug, Clone)]
struct FontImageConfig {
    text: String,
    font_size: f32,
    output_dir: PathBuf,
}

#[derive(Debug)]
struct GlyphMetrics {
    glyph_id: u32,
    width: i32,
    height: i32,
    // min_y: f32,
    max_y: f32,
}

type GlyphData = (font_kit::loaders::default::Font, Vec<GlyphMetrics>, Vector2I);

#[tauri::command]
async fn generate_font_images(text: Option<String>, app_handle: tauri::AppHandle) -> Result<String, String> {
    let generator = FontImageGenerator::new(text, FONT_SIZE)
        .map_err(|e| format!("Failed to initialize generator: {}", e))?;
    
    match generator.generate_all().await {
        Ok(output_dir) => {
            if let Err(e) = app_handle.emit("font_generation_complete", ()) {
                eprintln!("Failed to emit completion event: {}", e);
            }
            Ok(format!("Font images generated in: {}", output_dir.display()))
        }
        Err(e) => Err(format!("Font generation failed: {}", e))
    }
}

// Service layer for font operations
struct FontService;

impl FontService {
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
    
    fn create_output_directory() -> FontResult<PathBuf> {
        let app_data_dir = dirs::data_dir()
            .ok_or_else(|| FontError::Io(std::io::Error::new(
                std::io::ErrorKind::NotFound,
                "Failed to get app data directory"
            )))?
            .join("FontCluster");
        
        fs::create_dir_all(&app_data_dir)?;
        Ok(app_data_dir)
    }
}

// Main font image generation orchestrator
struct FontImageGenerator {
    config: FontImageConfig,
}

impl FontImageGenerator {
    fn new(text: Option<String>, font_size: f32) -> FontResult<Self> {
        let config = FontImageConfig {
            text: text.unwrap_or_else(|| PREVIEW_TEXT.to_string()),
            font_size,
            output_dir: FontService::create_output_directory()?,
        };
        
        Ok(Self { config })
    }
    
    async fn generate_all(&self) -> FontResult<PathBuf> {
        let font_families = FontService::get_system_fonts();
        
        let tasks = self.spawn_font_processing_tasks(font_families);
        join_all(tasks).await;
        
        Ok(self.config.output_dir.clone())
    }
    
    fn spawn_font_processing_tasks(
        &self,
        font_families: Vec<String>,
    ) -> Vec<task::JoinHandle<()>> {
        font_families
            .into_iter()
            .map(|family_name| {
                let config_clone = self.config.clone();
                
                task::spawn_blocking(move || {
                    let renderer = FontRenderer::new(&config_clone);
                    if let Err(e) = renderer.generate_font_image(&family_name) {
                        eprintln!("Failed to generate image for {}: {}", family_name, e);
                    }
                })
            })
            .collect()
    }
}

// Font rendering engine
struct FontRenderer<'a> {
    config: &'a FontImageConfig,
    source: SystemSource,
}

impl<'a> FontRenderer<'a> {
    fn new(config: &'a FontImageConfig) -> Self {
        Self {
            config,
            source: SystemSource::new(),
        }
    }
    
    fn generate_font_image(&self, family_name: &str) -> FontResult<()> {
        let font = self.load_font(family_name)?;
        let (font, glyph_data, canvas_size) = self.prepare_glyph_data(font)?;
        let canvas = self.render_glyphs_to_canvas(font, glyph_data, canvas_size)?;
        let img_buffer = self.convert_canvas_to_image(canvas, canvas_size);
        self.save_image(img_buffer, family_name)?;
        
        Ok(())
    }

    fn load_font(&self, family_name: &str) -> FontResult<font_kit::loaders::default::Font> {
        self.source
            .select_best_match(&[FamilyName::Title(family_name.to_string())], &Properties::new())
            .map_err(|e| FontError::FontSelection(format!("Failed to select font {}: {}", family_name, e)))?
            .load()
            .map_err(|e| FontError::FontLoad(format!("Failed to load font {}: {}", family_name, e)))
    }

    fn prepare_glyph_data(&self, font: font_kit::loaders::default::Font) -> FontResult<GlyphData> {
        let mut total_width = 0;
        let mut glyph_metrics = Vec::new();
        let metrics = font.metrics();
        
        // Track the actual bounds of all glyphs
        let mut min_y = f32::MAX;
        let mut max_y = f32::MIN;
        
        for ch in self.config.text.chars() {
            if let Some(glyph_id) = font.glyph_for_char(ch) {
                // Use accurate glyph width from advance metrics
                let advance = font.advance(glyph_id)
                    .map_err(|e| FontError::GlyphProcessing(format!("Failed to get glyph advance: {}", e)))?;
                
                // Get actual glyph bounds using typographic_bounds
                let bounds = font.typographic_bounds(glyph_id)
                    .map_err(|e| FontError::GlyphProcessing(format!("Failed to get glyph bounds: {}", e)))?;
                
                // Convert from font units to pixel units
                let glyph_width = (advance.x() * self.config.font_size / metrics.units_per_em as f32) as i32;
                
                // Track min and max Y bounds across all glyphs
                let scaled_min_y = bounds.min_y() * self.config.font_size / metrics.units_per_em as f32;
                let scaled_max_y = bounds.max_y() * self.config.font_size / metrics.units_per_em as f32;
                
                min_y = min_y.min(scaled_min_y);
                max_y = max_y.max(scaled_max_y);
                
                glyph_metrics.push(GlyphMetrics {
                    glyph_id,
                    width: glyph_width,
                    height: 0, // Will be calculated later
                    // min_y: scaled_min_y,
                    max_y: scaled_max_y,
                });
                
                total_width += glyph_width;
            }
        }
        
        if glyph_metrics.is_empty() {
            return Err(FontError::GlyphProcessing("No glyphs found for text".to_string()));
        }
        
        // Calculate actual height from glyph bounds with padding
        let actual_height = (max_y - min_y + 2.0 * GLYPH_PADDING) as i32;
        
        // Update glyph data with actual height
        for glyph in &mut glyph_metrics {
            glyph.height = actual_height;
        }
        
        let canvas_size = Vector2I::new(total_width, actual_height);
        Ok((font, glyph_metrics, canvas_size))
    }

    fn render_glyphs_to_canvas(
        &self,
        font: font_kit::loaders::default::Font,
        glyph_data: Vec<GlyphMetrics>,
        canvas_size: Vector2I,
    ) -> FontResult<Canvas> {
        let mut canvas = Canvas::new(canvas_size, Format::A8);
        let mut x_offset = 0;
        
        // Calculate baseline position with padding
        let max_y = glyph_data.iter().map(|g| g.max_y).fold(f32::MIN, f32::max);
        let baseline_y = max_y + GLYPH_PADDING;
        
        for glyph in glyph_data {
            let transform = Transform2F::from_translation(
                Vector2F::new(x_offset as f32, baseline_y)
            );
            
            if let Err(e) = font.rasterize_glyph(
                &mut canvas,
                glyph.glyph_id,
                self.config.font_size,
                transform,
                HintingOptions::None,
                RasterizationOptions::GrayscaleAa,
            ) {
                eprintln!("Failed to rasterize glyph: {}", e);
            }
            
            x_offset += glyph.width;
        }
        
        Ok(canvas)
    }

    fn convert_canvas_to_image(&self, canvas: Canvas, canvas_size: Vector2I) -> ImageBuffer<Rgba<u8>, Vec<u8>> {
        let canvas_data = canvas.pixels;
        let mut img_buffer = ImageBuffer::new(canvas_size.x() as u32, canvas_size.y() as u32);
        
        for (i, &pixel) in canvas_data.iter().enumerate() {
            let x = i as u32 % canvas_size.x() as u32;
            let y = i as u32 / canvas_size.x() as u32;
            // Use transparent background - alpha channel is 0 for background, 255 for text
            let alpha = if pixel > 0 { 255 } else { 0 };
            img_buffer.put_pixel(x, y, Rgba([pixel, pixel, pixel, alpha]));
        }
        
        img_buffer
    }

    fn save_image(
        &self,
        img_buffer: ImageBuffer<Rgba<u8>, Vec<u8>>,
        family_name: &str,
    ) -> FontResult<()> {
        let safe_name = family_name.replace(" ", "_").replace("/", "_");
        let output_path = self.config.output_dir.join(format!("{}.png", safe_name));
        
        img_buffer
            .save(&output_path)
            .map_err(|e| FontError::ImageGeneration(format!("Failed to save image: {}", e)))?;
        
        println!("Saved font image: {} -> {}", family_name, output_path.display());
        Ok(())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![greet, get_system_fonts, generate_font_images])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
