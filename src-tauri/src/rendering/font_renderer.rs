use crate::core::SessionManager;
use crate::config::{FontImageConfig, GlyphMetrics, GlyphData, GLYPH_PADDING};
use crate::error::{FontResult, FontError};
use font_kit::source::SystemSource;
use font_kit::canvas::{Canvas, Format, RasterizationOptions};
use font_kit::family_name::FamilyName;
use font_kit::hinting::HintingOptions;
use font_kit::properties::{Properties, Weight};
use std::sync::Arc;
use pathfinder_geometry::transform2d::Transform2F;
use pathfinder_geometry::vector::{Vector2F, Vector2I};
use image::{ImageBuffer, Rgba};

// Font rendering engine
pub struct FontRenderer<'a> {
    config: &'a FontImageConfig,
    source: Arc<SystemSource>,
}

impl<'a> FontRenderer<'a> {
    pub fn new(config: &'a FontImageConfig) -> Self {
        Self {
            config,
            source: Arc::new(SystemSource::new()),
        }
    }
    
    pub fn with_shared_source(config: &'a FontImageConfig, source: Arc<SystemSource>) -> Self {
        Self {
            config,
            source,
        }
    }
    
    pub fn generate_font_image(&self, family_name: &str, weight_value: i32) -> FontResult<()> {
        let weight = Weight(weight_value as f32);
        
        let font = self.load_font_with_weight(family_name, weight)?;
        let full_name = font.full_name();
        let (font, glyph_data, canvas_size) = self.prepare_glyph_data(font, weight)?;
        let canvas = self.render_glyphs_to_canvas(font, glyph_data, canvas_size)?;
        let img_buffer = self.convert_canvas_to_image(canvas, canvas_size);
        
        self.save_image(img_buffer, family_name, &full_name, weight_value)?;
        
        Ok(())
    }

    fn load_font_with_weight(&self, family_name: &str, weight: Weight) -> FontResult<font_kit::loaders::default::Font> {
        let properties = Properties {
            weight,
            ..Default::default()
        };
        
        let handle = self.source.as_ref()
            .select_best_match(&[FamilyName::Title(family_name.to_string())], &properties)
            .map_err(|e| FontError::FontSelection(format!("Failed to select font {} with weight {:?}: {}", family_name, weight, e)))?;
            
        let font = handle.load()
            .map_err(|e| FontError::FontLoad(format!("Failed to load font {} with weight {:?}: {}", family_name, weight, e)))?;
            
        // Verify the loaded font has the requested weight
        let actual_properties = font.properties();
        if actual_properties.weight != weight {
            return Err(FontError::FontSelection(format!("Font {} loaded with weight {:?} but requested weight {:?}", family_name, actual_properties.weight, weight)));
        }
        
        Ok(font)
    }

    fn prepare_glyph_data(&self, font: font_kit::loaders::default::Font, _weight: Weight) -> FontResult<GlyphData> {
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
        full_name: &str,
        weight_value: i32,
    ) -> FontResult<()> {
        // Check if image is empty or fully transparent
        if self.is_image_empty(&img_buffer) {
            println!("Skipping font '{}' weight {} - image is empty or fully transparent", full_name, weight_value);
            return Ok(());
        }
        
        let safe_name = format!("{}_{}", weight_value, family_name.replace(" ", "_").replace("/", "_"));
        let display_name = full_name.to_string();

        let session_manager = SessionManager::global();
        let font_dir = session_manager.create_font_directory(&safe_name, &display_name, weight_value)?;
        let output_path = font_dir.join("sample.png");
        
        img_buffer
            .save(&output_path)
            .map_err(|e| FontError::ImageGeneration(format!("Failed to save image: {}", e)))?;
        
        println!("Saved font image: {} weight {} -> {}", full_name, weight_value, output_path.display());
        Ok(())
    }
    
    fn is_image_empty(&self, img_buffer: &ImageBuffer<Rgba<u8>, Vec<u8>>) -> bool {
        img_buffer.pixels().all(|pixel| pixel[3] == 0)
    }
}