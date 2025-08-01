use crate::config::{FontImageConfig, GLYPH_PADDING};
use crate::error::{FontResult, FontError};
use crate::core::SessionManager;
use skia_safe::{
    Paint, Font, Point, Color, Surface, surfaces,
    font_style::{FontStyle, Slant, Weight, Width},
    typeface::Typeface,
    FontMgr, EncodedImageFormat,
};

// GPU support will be enabled when GPU feature is available
#[cfg(feature = "gpu")]
use skia_safe::gpu::{self, DirectContext};

/// Skia-based font renderer (CPU for now, GPU-ready architecture)
pub struct SkiaFontRenderer<'a> {
    config: &'a FontImageConfig,
    #[cfg(feature = "gpu")]
    context: Option<DirectContext>,
    font_mgr: FontMgr,
}

impl<'a> SkiaFontRenderer<'a> {
    pub fn new(config: &'a FontImageConfig) -> FontResult<Self> {
        // GPU context initialization (only when GPU feature is enabled)
        #[cfg(feature = "gpu")]
        let context = {
            let ctx = gpu::DirectContext::new_gl(None, None).ok();
            if ctx.is_some() {
                println!("✅ GPU context created successfully");
            } else {
                println!("⚠️  GPU context failed, will use CPU rendering");
            }
            ctx
        };
        
        #[cfg(not(feature = "gpu"))]
        println!("🖥️  Using CPU-based Skia rendering (GPU feature disabled)");
        
        let font_mgr = FontMgr::default();
        
        Ok(Self {
            config,
            #[cfg(feature = "gpu")]
            context,
            font_mgr,
        })
    }
    
    pub fn generate_font_image(&mut self, family_name: &str, weight_value: i32) -> FontResult<()> {
        // Create typeface
        let typeface = self.create_typeface(family_name, weight_value)?;
        let full_name = typeface.family_name();
        
        // Calculate text dimensions
        let font = Font::from_typeface(&typeface, self.config.font_size);
        let paint = self.create_paint();
        let text_bounds = self.measure_text(&font, &paint)?;
        
        // Create surface (GPU if available, otherwise CPU)
        let mut surface = self.create_surface(text_bounds.width as i32, text_bounds.height as i32)?;
        
        // Draw text using GPU acceleration
        self.draw_text_to_surface(&mut surface, &font, &paint)?;
        
        // Save image
        self.save_surface_to_file(surface, family_name, &full_name, weight_value)?;
        
        println!("✅ Skia GPU rendered: {} weight {}", full_name, weight_value);
        Ok(())
    }
    
    fn create_typeface(&self, family_name: &str, weight_value: i32) -> FontResult<Typeface> {
        let font_style = FontStyle::new(
            Weight::from(weight_value as i32),
            Width::NORMAL,
            Slant::Upright,
        );
        
        let typeface = self.font_mgr
            .match_family_style(family_name, font_style)
            .ok_or_else(|| FontError::FontSelection(format!(
                "Failed to find typeface for family '{}' with weight {}", 
                family_name, weight_value
            )))?;
            
        // For now, skip weight verification as Skia API is complex
        // TODO: Implement proper weight verification when needed
        println!("Loaded font: {} (weight verification skipped)", family_name);
        
        Ok(typeface)
    }
    
    fn create_paint(&self) -> Paint {
        let mut paint = Paint::default();
        paint.set_color(Color::BLACK);
        paint.set_anti_alias(true);
        paint
    }
    
    fn measure_text(&self, font: &Font, _paint: &Paint) -> FontResult<TextBounds> {
        let text = &self.config.text;
        
        // Get font metrics
        let (_line_spacing, metrics) = font.metrics();
        
        // Measure text width using font
        let text_width = font.measure_str(text, None).0;
        
        // Calculate height from metrics
        let text_height = metrics.descent - metrics.ascent;
        
        Ok(TextBounds {
            width: text_width + 2.0 * GLYPH_PADDING,
            height: text_height + 2.0 * GLYPH_PADDING,
            baseline_y: -metrics.ascent + GLYPH_PADDING,
        })
    }
    
    fn create_surface(&mut self, width: i32, height: i32) -> FontResult<Surface> {
        // Try GPU surface first (if GPU feature is enabled)
        #[cfg(feature = "gpu")]
        if let Some(ref mut context) = self.context {
            if let Some(surface) = Surface::new_render_target(
                context,
                skia_safe::Budgeted::Yes,
                &skia_safe::ImageInfo::new(
                    (width, height),
                    ColorType::RGBA8888,
                    skia_safe::AlphaType::Premul,
                    None,
                ),
            ) {
                return Ok(surface);
            }
        }
        
        // CPU surface (fallback or default when GPU is disabled)
        surfaces::raster_n32_premul((width, height))
            .ok_or_else(|| FontError::ImageGeneration(
                "Failed to create CPU surface".to_string()
            ))
    }
    
    fn draw_text_to_surface(
        &self, 
        surface: &mut Surface, 
        font: &Font, 
        paint: &Paint
    ) -> FontResult<()> {
        let canvas = surface.canvas();
        
        // Clear background to transparent
        canvas.clear(Color::TRANSPARENT);
        
        // Calculate text bounds for positioning
        let text_bounds = self.measure_text(font, paint)?;
        
        // Draw text using GPU-accelerated draw_str method
        canvas.draw_str(
            &self.config.text,
            Point::new(GLYPH_PADDING, text_bounds.baseline_y),
            font,
            paint,
        );
        
        // Flush GPU commands if using GPU context
        #[cfg(feature = "gpu")]
        if self.context.is_some() {
            surface.flush_and_submit();
        }
        
        Ok(())
    }
    
    fn save_surface_to_file(
        &self,
        mut surface: Surface,
        family_name: &str,
        full_name: &str,
        weight_value: i32,
    ) -> FontResult<()> {
        // Create snapshot
        let image = surface.image_snapshot();
        
        // Check if image has content
        if self.is_image_empty(&image)? {
            println!("Skipping font '{}' weight {} - image is empty", full_name, weight_value);
            return Ok(());
        }
        
        // Encode to PNG (using deprecated method as context-aware is not available)
        let image = surface.image_snapshot();
        #[allow(deprecated)]
        let data = image.encode_to_data(EncodedImageFormat::PNG).ok_or_else(|| {
            FontError::ImageGeneration("Failed to encode image to PNG".to_string())
        })?;
        
        // Save file
        let safe_name = format!("{}_{}", weight_value, family_name.replace(" ", "_").replace("/", "_"));
        let session_manager = SessionManager::global();
        let font_dir = session_manager.create_font_directory(&safe_name, full_name, family_name, weight_value)?;
        let output_path = font_dir.join("sample.png");
        
        std::fs::write(&output_path, data.as_bytes()).map_err(|e| {
            FontError::ImageGeneration(format!("Failed to write PNG file: {}", e))
        })?;
        
        println!("Saved Skia GPU image: {} weight {} -> {}", full_name, weight_value, output_path.display());
        Ok(())
    }
    
    fn is_image_empty(&self, image: &skia_safe::Image) -> FontResult<bool> {
        // Simple check: if image dimensions are too small, consider empty
        Ok(image.width() < 10 || image.height() < 10)
    }
}

#[derive(Debug)]
struct TextBounds {
    width: f32,
    height: f32,
    baseline_y: f32,
}