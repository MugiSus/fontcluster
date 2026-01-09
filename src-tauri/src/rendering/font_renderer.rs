use crate::config::{RenderConfig, GLYPH_PADDING};
use crate::error::{Result, AppError};
use font_kit::canvas::{Canvas, Format, RasterizationOptions};
use font_kit::hinting::HintingOptions;
use std::sync::Arc;
use pathfinder_geometry::transform2d::Transform2F;
use pathfinder_geometry::vector::{Vector2F, Vector2I};
use image::ImageEncoder;
use std::io::BufWriter;
use std::fs::File;

pub struct FontRenderer {
    config: Arc<RenderConfig>,
}

impl FontRenderer {
    pub fn new(config: Arc<RenderConfig>) -> Self {
        Self { config }
    }


    pub fn render_sample(&self, font: &font_kit::font::Font, safe_name: &str) -> Result<()> {
        let scale = self.config.font_size / font.metrics().units_per_em as f32;
        let mut glyph_data = Vec::new();
        let font_data = font.copy_font_data().ok_or_else(|| AppError::Font("Failed to get font data for glyph check".to_string()))?;
        let face = ttf_parser::Face::parse(&font_data, 0).map_err(|e| AppError::Font(format!("Failed to parse font with ttf-parser: {}", e)))?;

        for ch in self.config.text.chars() {
            let gid = face.glyph_index(ch).ok_or_else(|| AppError::Font(format!("No glyph for {}", ch)))?;
            if gid.0 == 0 && ch != '\0' && ch != '\u{FFFD}' {
                return Err(AppError::Font(format!("Font fallback detected for character '{}' (missing in cmap)", ch)));
            }
            
            let fk_gid = gid.0 as u32;
            let advance = font.advance(fk_gid)?;
            let bounds = font.typographic_bounds(fk_gid)?;
            glyph_data.push((fk_gid, (advance.x() * scale) as i32, bounds.max_y() * scale, bounds.min_y() * scale));
        }

        let total_width: i32 = glyph_data.iter().map(|g| g.1).sum();
        let (min_y, max_y) = glyph_data.iter().fold((f32::MAX, f32::MIN), |(min, max), g| (min.min(g.3), max.max(g.2)));
        let height = (max_y - min_y + 2.0 * GLYPH_PADDING) as i32;
        let baseline_y = max_y + GLYPH_PADDING;

        let mut canvas = Canvas::new(Vector2I::new(total_width, height), Format::A8);
        let mut x_off = 0.0;
        for (gid, width, _, _) in glyph_data {
            font.rasterize_glyph(&mut canvas, gid, self.config.font_size, Transform2F::from_translation(Vector2F::new(x_off, baseline_y)), HintingOptions::None, RasterizationOptions::GrayscaleAa)?;
            x_off += width as f32;
        }

        if canvas.pixels.iter().all(|&p| p == 0) {
            return Err(AppError::Font("Empty render result (no visible glyphs)".into()));
        }

        let path = self.config.output_dir.join(safe_name).join("sample.png");
        let writer = BufWriter::new(File::create(path)?);
        let encoder = image::codecs::png::PngEncoder::new_with_quality(writer, image::codecs::png::CompressionType::Fast, image::codecs::png::FilterType::NoFilter);
        encoder.write_image(&canvas.pixels, total_width as u32, height as u32, image::ExtendedColorType::L8)?;

        Ok(())
    }
}