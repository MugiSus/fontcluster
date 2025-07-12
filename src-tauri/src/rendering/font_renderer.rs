use crate::core::SessionManager;
use crate::config::{FontImageConfig, GlyphMetrics, GlyphData, GLYPH_PADDING};
use crate::error::{FontResult, FontError};
use crate::google_fonts::GoogleFontsClient;
use font_kit::source::SystemSource;
use font_kit::canvas::{Canvas, Format, RasterizationOptions};
use font_kit::family_name::FamilyName;
use font_kit::hinting::HintingOptions;
use font_kit::properties::Properties;
use pathfinder_geometry::transform2d::Transform2F;
use pathfinder_geometry::vector::{Vector2F, Vector2I};
use image::{ImageBuffer, Rgba};
use std::io::Cursor;

// Font rendering engine
#[derive(Clone)]
pub struct FontRenderer<'a> {
    config: &'a FontImageConfig,
    google_fonts_client: Option<GoogleFontsClient>,
}

impl<'a> FontRenderer<'a> {
    pub fn new(config: &'a FontImageConfig) -> Self {
        Self {
            config,
            google_fonts_client: None,
        }
    }

    pub fn with_google_fonts(config: &'a FontImageConfig, api_key: String) -> Self {
        Self {
            config,
            google_fonts_client: Some(GoogleFontsClient::new(api_key)),
        }
    }
    
    pub fn generate_font_image(&self, family_name: &str) -> FontResult<()> {
        let font = self.load_font(family_name)?;
        let (font, glyph_data, canvas_size) = self.prepare_glyph_data(font)?;
        let canvas = self.render_glyphs_to_canvas(font, glyph_data, canvas_size)?;
        let img_buffer = self.convert_canvas_to_image(canvas, canvas_size);
        self.save_image(img_buffer, family_name)?;
        
        Ok(())
    }

    pub async fn generate_training_image(&self, family_name: &str) -> FontResult<Vec<u8>> {
        let font = self.load_font_for_training(family_name).await?;
        let training_text = "A quick brown fox jumps over the lazy dog";
        let training_config = FontImageConfig {
            font_size: 64.0,
            text: training_text.to_string(),
            output_dir: std::path::PathBuf::from("/tmp"), // Temporary directory since we're returning bytes
        };
        
        let temp_renderer = FontRenderer {
            config: &training_config,
            google_fonts_client: self.google_fonts_client.as_ref().cloned(),
        };
        
        let (font, glyph_data, canvas_size) = temp_renderer.prepare_glyph_data(font)?;
        let canvas = temp_renderer.render_glyphs_to_canvas(font, glyph_data, canvas_size)?;
        let img_buffer = temp_renderer.convert_canvas_to_image(canvas, canvas_size);
        
        // Convert to bytes for vectorization
        let mut buffer = Vec::new();
        {
            let mut cursor = Cursor::new(&mut buffer);
            img_buffer.write_to(&mut cursor, image::ImageFormat::Png)
                .map_err(|e| FontError::ImageGeneration(format!("Failed to convert image to bytes: {}", e)))?;
        }
        
        Ok(buffer)
    }

    fn load_font(&self, family_name: &str) -> FontResult<font_kit::loaders::default::Font> {
        let source = SystemSource::new();
        source
            .select_best_match(&[FamilyName::Title(family_name.to_string())], &Properties::new())
            .map_err(|e| FontError::FontSelection(format!("Failed to select font {}: {}", family_name, e)))?
            .load()
            .map_err(|e| FontError::FontLoad(format!("Failed to load font {}: {}", family_name, e)))
    }

    async fn load_font_for_training(&self, family_name: &str) -> FontResult<font_kit::loaders::default::Font> {
        // First try to load from system fonts
        if let Ok(font) = self.load_font(family_name) {
            return Ok(font);
        }

        // If not found and Google Fonts client is available, try to download
        if let Some(ref client) = self.google_fonts_client {
            if let Ok(Some(google_font)) = client.get_font_by_family(family_name).await {
                // Try to get regular variant first, fallback to first available
                let font_url = google_font.files.get("regular")
                    .or_else(|| google_font.files.values().next())
                    .ok_or_else(|| FontError::FontSelection(format!("No font files available for {}", family_name)))?;

                let font_data = client.download_font(font_url).await?;
                let font = font_kit::loaders::default::Font::from_bytes(
                    std::sync::Arc::new(font_data), 0
                ).map_err(|e| FontError::FontLoad(format!("Failed to load downloaded font {}: {}", family_name, e)))?;

                return Ok(font);
            }
        }

        Err(FontError::FontSelection(format!("Font {} not found in system or Google Fonts", family_name)))
    }

    fn prepare_glyph_data(&self, font: font_kit::loaders::default::Font) -> FontResult<GlyphData> {
        let metrics = font.metrics();
        let scale = self.config.font_size / metrics.units_per_em as f32;
        
        let glyph_results: Result<Vec<(GlyphMetrics, f32, f32)>, FontError> = self.config.text.chars()
            .map(|ch| {
                let glyph_id = font.glyph_for_char(ch)
                    .ok_or_else(|| FontError::GlyphProcessing(format!("Glyph for character '{}' not found in font", ch)))?;
                
                let advance = font.advance(glyph_id)
                    .map_err(|e| FontError::GlyphProcessing(format!("Failed to get glyph advance: {}", e)))?;
                
                let bounds = font.typographic_bounds(glyph_id)
                    .map_err(|e| FontError::GlyphProcessing(format!("Failed to get glyph bounds: {}", e)))?;
                
                let glyph_width = (advance.x() * scale) as i32;
                let scaled_min_y = bounds.min_y() * scale;
                let scaled_max_y = bounds.max_y() * scale;
                
                Ok((GlyphMetrics {
                    glyph_id,
                    width: glyph_width,
                    height: 0, // Will be calculated later
                    max_y: scaled_max_y,
                }, scaled_min_y, scaled_max_y))
            })
            .collect();
        
        let glyph_data = glyph_results?;
        
        if glyph_data.is_empty() {
            return Err(FontError::GlyphProcessing("No glyphs found for text".to_string()));
        }
        
        let (min_y, max_y) = glyph_data.iter()
            .fold((f32::MAX, f32::MIN), |(min, max), (_, min_y, max_y)| {
                (min.min(*min_y), max.max(*max_y))
            });
        
        let actual_height = (max_y - min_y + 2.0 * GLYPH_PADDING) as i32;
        let total_width: i32 = glyph_data.iter().map(|(glyph, _, _)| glyph.width).sum();
        
        let glyph_metrics: Vec<GlyphMetrics> = glyph_data.into_iter()
            .map(|(mut glyph, _, _)| {
                glyph.height = actual_height;
                glyph
            })
            .collect();
        
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
            
            // Fail fast if any glyph cannot be rasterized
            if let Err(e) = font.rasterize_glyph(
                &mut canvas,
                glyph.glyph_id,
                self.config.font_size,
                transform,
                HintingOptions::None,
                RasterizationOptions::GrayscaleAa,
            ) {
                return Err(FontError::GlyphProcessing(format!("Failed to rasterize glyph {}: {}", glyph.glyph_id, e)));
            }
            
            x_offset += glyph.width;
        }
        
        Ok(canvas)
    }

    fn convert_canvas_to_image(&self, canvas: Canvas, canvas_size: Vector2I) -> ImageBuffer<Rgba<u8>, Vec<u8>> {
        let width = canvas_size.x() as u32;
        let height = canvas_size.y() as u32;
        
        ImageBuffer::from_fn(width, height, |x, y| {
            let i = (y * width + x) as usize;
            let pixel = canvas.pixels.get(i).copied().unwrap_or(0);
            let alpha = if pixel > 0 { 255 } else { 0 };
            Rgba([pixel, pixel, pixel, alpha])
        })
    }

    fn save_image(
        &self,
        img_buffer: ImageBuffer<Rgba<u8>, Vec<u8>>,
        family_name: &str,
    ) -> FontResult<()> {
        // Check if image is empty or fully transparent
        if self.is_image_empty(&img_buffer) {
            println!("Skipping font '{}' - image is empty or fully transparent", family_name);
            return Ok(());
        }
        
        let safe_name = family_name.replace(" ", "_").replace("/", "_");
        let session_manager = SessionManager::global();
        let font_dir = session_manager.create_font_directory(&safe_name, family_name)?;
        let output_path = font_dir.join("sample.png");
        
        img_buffer
            .save(&output_path)
            .map_err(|e| FontError::ImageGeneration(format!("Failed to save image: {}", e)))?;
        
        println!("Saved font image: {} -> {}", family_name, output_path.display());
        Ok(())
    }
    
    fn is_image_empty(&self, img_buffer: &ImageBuffer<Rgba<u8>, Vec<u8>>) -> bool {
        img_buffer.pixels().all(|pixel| pixel[3] == 0)
    }
}