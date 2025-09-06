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
use image::GrayImage;
use imageproc::hog::*;
use std::fs;
use bytemuck;

// Font rendering engine
pub struct FontRenderer<'a> {
    config: &'a FontImageConfig,
    source: Arc<SystemSource>,
}

impl<'a> FontRenderer<'a> {
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
        
        // Extract HOG features directly from canvas and save vector only
        let hog_features = self.extract_hog_features_from_canvas(&canvas, canvas_size)?;
        self.save_vector_to_file(&hog_features, family_name, &full_name, weight_value)?;
        
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
        println!("Font: {} | Requested weight: {:?} | Actual weight: {:?}", family_name, weight, actual_properties.weight);
        let weight_diff = (actual_properties.weight.0 - weight.0).abs();
        if weight_diff > 50.0 {
            return Err(FontError::FontSelection(format!("Font {} loaded with weight {:?} but requested weight {:?} (difference: {})", family_name, actual_properties.weight, weight, weight_diff)));
        }
        
        Ok(font)
    }

    fn prepare_glyph_data(&self, font: font_kit::loaders::default::Font, _weight: Weight) -> FontResult<GlyphData> {
        let metrics = font.metrics();
        let scale = self.config.font_size / metrics.units_per_em as f32;
        
        // Single-pass character processing: glyph lookup + metrics calculation in one iteration
        let glyph_results: Result<Vec<(GlyphMetrics, f32, f32)>, FontError> = self.config.text.chars()
            .map(|ch| {
                // Get glyph ID or fail immediately
                let glyph_id = font.glyph_for_char(ch)
                    .ok_or_else(|| FontError::GlyphProcessing(format!("No glyph found for character '{}'", ch)))?;
                
                // Calculate metrics immediately
                let advance = font.advance(glyph_id)
                    .map_err(|_| FontError::GlyphProcessing("Failed to get glyph advance".to_string()))?;
                
                let bounds = font.typographic_bounds(glyph_id)
                    .map_err(|_| FontError::GlyphProcessing("Failed to get glyph bounds".to_string()))?;
                
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


    fn extract_hog_features_from_canvas(&self, canvas: &Canvas, canvas_size: Vector2I) -> FontResult<Vec<f32>> {
        let width = canvas_size.x() as u32;
        let height = canvas_size.y() as u32;
        
        // Convert Canvas (A8) directly to GrayImage
        let gray_image = GrayImage::from_raw(width, height, canvas.pixels.clone())
            .ok_or_else(|| FontError::Vectorization("Failed to create GrayImage from Canvas".to_string()))?;
        
        // Resize to standard canvas size with padding
        let padded_image = self.resize_with_padding(&gray_image, 512, 96)?;
        
        // Configure HOG parameters (same as vectorizer.rs)
        let hog_options = HogOptions {
            orientations: 9,
            cell_side: 8,
            block_side: 2,
            block_stride: 1,
            signed: false,
        };
        
        // Extract HOG features
        let features = hog(&padded_image, hog_options)
            .map_err(|e| FontError::Vectorization(format!("HOG extraction failed: {}", e)))?;
        
        if features.is_empty() {
            return Err(FontError::Vectorization("HOG feature extraction failed: no features generated".to_string()));
        }
        
        Ok(features)
    }
    
    fn resize_with_padding(&self, img: &GrayImage, target_width: u32, target_height: u32) -> FontResult<GrayImage> {
        let original_width = img.width();
        let original_height = img.height();
        
        // Calculate scaling factor to fit within target while preserving aspect ratio
        let scale_x = target_width as f32 / original_width as f32;
        let scale_y = target_height as f32 / original_height as f32;
        let scale = scale_x.min(scale_y);
        
        let new_width = (original_width as f32 * scale) as u32;
        let new_height = (original_height as f32 * scale) as u32;
        
        // Resize the image while preserving aspect ratio
        let resized_img = image::imageops::resize(
            img,
            new_width,
            new_height,
            image::imageops::FilterType::Lanczos3
        );
        
        // Create black canvas (0 for grayscale since Canvas A8 uses 0 for background)
        let mut canvas = image::GrayImage::new(target_width, target_height);
        for pixel in canvas.pixels_mut() {
            *pixel = image::Luma([0u8]); // Black background to match Canvas A8
        }
        
        // Calculate position to center the resized image
        let offset_x = (target_width - new_width) / 2;
        let offset_y = (target_height - new_height) / 2;
        
        // Copy resized image onto canvas
        image::imageops::overlay(&mut canvas, &resized_img, offset_x as i64, offset_y as i64);
        
        Ok(canvas)
    }
    
    fn save_vector_to_file(&self, vector: &[f32], family_name: &str, full_name: &str, weight_value: i32) -> FontResult<()> {
        let safe_name = format!("{}_{}", weight_value, family_name.replace(' ', "_").replace('/', "_"));
        
        let session_manager = SessionManager::global();
        let font_dir = session_manager.create_font_directory(&safe_name, full_name, family_name, weight_value)?;
        let vector_path = font_dir.join("vector.bin");
        
        // Convert f32 slice to bytes using bytemuck (zero-copy, safe)
        let bytes = bytemuck::cast_slice(vector);
        fs::write(&vector_path, bytes)
            .map_err(|e| FontError::Vectorization(format!("Failed to write vector file {}: {}", vector_path.display(), e)))?;
        
        Ok(())
    }
}