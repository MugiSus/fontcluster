use crate::config::{RenderConfig, GLYPH_PADDING};
use crate::error::{AppError, Result};
use image::ImageEncoder;
use std::fs::{self, File};
use std::io::BufWriter;
use std::panic::{self, AssertUnwindSafe};
use std::path::Path;
use std::sync::Arc;
use swash::scale::image::{Content, Image};
use swash::scale::{Render, ScaleContext, Source, StrikeWith};
use swash::shape::{Direction, ShapeContext};
use swash::text::Script;
use swash::zeno::{Format, Vector};
use swash::{FontRef, GlyphId};

struct RenderedGlyph {
    image: Image,
    x: i32,
    y: i32,
}

pub struct FontRenderer {
    config: Arc<RenderConfig>,
}

impl FontRenderer {
    pub fn new(config: Arc<RenderConfig>) -> Self {
        Self { config }
    }

    pub fn render_sample(&self, font_path: &Path, font_index: u32, safe_name: &str) -> Result<()> {
        let path = self
            .config
            .output_dir
            .join("samples")
            .join(safe_name)
            .join("sample.png");
        self.render_to_path(font_path, font_index, &path)
    }

    pub fn render_to_path(&self, font_path: &Path, font_index: u32, path: &Path) -> Result<()> {
        match panic::catch_unwind(AssertUnwindSafe(|| {
            self.render_to_path_inner(font_path, font_index, path)
        })) {
            Ok(result) => result,
            Err(payload) => {
                let message = if let Some(message) = payload.downcast_ref::<&str>() {
                    (*message).to_string()
                } else if let Some(message) = payload.downcast_ref::<String>() {
                    message.clone()
                } else {
                    "unknown panic".to_string()
                };
                Err(AppError::Font(format!("Font renderer panicked: {message}")))
            }
        }
    }

    fn render_to_path_inner(&self, font_path: &Path, font_index: u32, path: &Path) -> Result<()> {
        let font_data = std::fs::read(font_path).map_err(|e| {
            AppError::Io(format!(
                "Failed to read font file {}: {}",
                font_path.display(),
                e
            ))
        })?;
        let font = FontRef::from_index(&font_data, font_index as usize).ok_or_else(|| {
            AppError::Font(format!(
                "Failed to parse font face {} in {}",
                font_index,
                font_path.display()
            ))
        })?;

        for ch in self.config.text.chars() {
            let gid = font.charmap().map(ch);
            if gid == 0 && ch != '\0' && ch != '\u{FFFD}' {
                return Err(AppError::MissingGlyph(ch));
            }
        }

        let script = swash::text::analyze(self.config.text.chars())
            .map(|(properties, _)| properties.script())
            .find(|script| !matches!(script, Script::Common | Script::Inherited | Script::Unknown))
            .unwrap_or(Script::Latin);
        let mut shape_context = ShapeContext::new();
        let mut shaper = shape_context
            .builder(font)
            .size(self.config.font_size)
            .script(script)
            .direction(Direction::LeftToRight)
            .build();
        shaper.add_str(&self.config.text);

        let mut glyphs = Vec::<(GlyphId, f32, f32)>::new();
        let mut pen_x = 0.0;
        shaper.shape_with(|cluster| {
            for glyph in cluster.glyphs {
                glyphs.push((glyph.id, pen_x + glyph.x, glyph.y));
                pen_x += glyph.advance;
            }
        });

        let mut scale_context = ScaleContext::new();
        let mut scaler = scale_context
            .builder(font)
            .size(self.config.font_size)
            .hint(true)
            .build();
        let sources = [
            Source::ColorOutline(0),
            Source::ColorBitmap(StrikeWith::BestFit),
            Source::Outline,
        ];
        let mut rendered = Vec::new();
        let mut min_x = i32::MAX;
        let mut min_y = i32::MAX;
        let mut max_x = i32::MIN;
        let mut max_y = i32::MIN;

        for (glyph_id, x, y) in glyphs {
            let offset = Vector::new(x.fract(), y.fract());
            let image = Render::new(&sources)
                .format(Format::Alpha)
                .offset(offset)
                .render(&mut scaler, glyph_id);
            if let Some(image) = image {
                if image.placement.width == 0 || image.placement.height == 0 {
                    continue;
                }

                let left = x.floor() as i32 + image.placement.left;
                let top = -(y.floor() as i32) - image.placement.top;
                let right = left + image.placement.width as i32;
                let bottom = top + image.placement.height as i32;
                min_x = min_x.min(left);
                min_y = min_y.min(top);
                max_x = max_x.max(right);
                max_y = max_y.max(bottom);
                rendered.push(RenderedGlyph {
                    image,
                    x: left,
                    y: top,
                });
            }
        }

        if rendered.is_empty() {
            return Err(AppError::Font(
                "Empty render result (no visible glyphs)".into(),
            ));
        }

        let padding = GLYPH_PADDING.ceil() as i32;
        let width = (max_x - min_x + padding * 2).max(1) as u32;
        let height = (max_y - min_y + padding * 2).max(1) as u32;
        let mut la8_pixels = vec![0u8; (width * height * 2) as usize];

        for rendered_glyph in rendered {
            let image = rendered_glyph.image;
            let dst_x = rendered_glyph.x - min_x + padding;
            let dst_y = rendered_glyph.y - min_y + padding;
            for row in 0..image.placement.height as i32 {
                for col in 0..image.placement.width as i32 {
                    let x = dst_x + col;
                    let y = dst_y + row;
                    if x < 0 || y < 0 || x >= width as i32 || y >= height as i32 {
                        continue;
                    }

                    let source_index = (row as u32 * image.placement.width + col as u32) as usize;
                    let alpha = match image.content {
                        Content::Mask => image.data[source_index],
                        Content::Color | Content::SubpixelMask => image.data[source_index * 4 + 3],
                    };
                    let target_index = ((y as u32 * width + x as u32) * 2) as usize;
                    la8_pixels[target_index] = 255;
                    la8_pixels[target_index + 1] =
                        la8_pixels[target_index + 1].saturating_add(alpha);
                }
            }
        }

        if la8_pixels.chunks_exact(2).all(|pixel| pixel[1] == 0) {
            return Err(AppError::Font(
                "Empty render result (no visible pixels)".into(),
            ));
        }

        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        let writer = BufWriter::new(File::create(path)?);
        let encoder = image::codecs::png::PngEncoder::new_with_quality(
            writer,
            image::codecs::png::CompressionType::Fast,
            image::codecs::png::FilterType::NoFilter,
        );
        encoder.write_image(&la8_pixels, width, height, image::ExtendedColorType::La8)?;

        Ok(())
    }
}
