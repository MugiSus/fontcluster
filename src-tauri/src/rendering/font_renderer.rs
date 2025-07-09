use crate::core::FontService;
use crate::config::{FontImageConfig, GlyphMetrics, GlyphData, GLYPH_PADDING};
use crate::error::{FontResult, FontError};
use font_kit::source::SystemSource;
use font_kit::canvas::{Canvas, Format, RasterizationOptions};
use font_kit::family_name::FamilyName;
use font_kit::hinting::HintingOptions;
use font_kit::properties::Properties;
use pathfinder_geometry::transform2d::Transform2F;
use pathfinder_geometry::vector::{Vector2F, Vector2I};
use image::{ImageBuffer, Rgba};

// Font rendering engine
pub struct FontRenderer<'a> {
    config: &'a FontImageConfig,
    source: SystemSource,
}

impl<'a> FontRenderer<'a> {
    pub fn new(config: &'a FontImageConfig) -> Self {
        Self {
            config,
            source: SystemSource::new(),
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
        // Check if image is empty or fully transparent
        if self.is_image_empty(&img_buffer) {
            println!("Skipping font '{}' - image is empty or fully transparent", family_name);
            return Ok(());
        }
        
        let safe_name = family_name.replace(" ", "_").replace("/", "_");
        let images_dir = FontService::get_images_directory()?;
        let output_path = images_dir.join(format!("{}.png", safe_name));
        
        img_buffer
            .save(&output_path)
            .map_err(|e| FontError::ImageGeneration(format!("Failed to save image: {}", e)))?;
        
        println!("Saved font image: {} -> {}", family_name, output_path.display());
        Ok(())
    }
    
    fn is_image_empty(&self, img_buffer: &ImageBuffer<Rgba<u8>, Vec<u8>>) -> bool {
        // Check if any pixel has non-zero alpha (not transparent)
        for pixel in img_buffer.pixels() {
            if pixel[3] > 0 {  // Alpha channel > 0 means not transparent
                return false;
            }
        }
        true  // All pixels are transparent
    }
}