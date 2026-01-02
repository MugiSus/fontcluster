use crate::config::{RenderConfig, FontMetadata, GLYPH_PADDING};
use crate::error::{Result, AppError};
use crate::core::session::save_font_metadata;
use font_kit::source::SystemSource;
use font_kit::canvas::{Canvas, Format, RasterizationOptions};
use font_kit::family_name::FamilyName;
use font_kit::hinting::HintingOptions;
use font_kit::properties::{Properties, Weight};
use std::sync::Arc;
use pathfinder_geometry::transform2d::Transform2F;
use pathfinder_geometry::vector::{Vector2F, Vector2I};
use image::ImageEncoder;
use std::io::BufWriter;
use std::fs::File;
use std::collections::HashMap;

pub struct FontRenderer {
    config: Arc<RenderConfig>,
    source: Arc<SystemSource>,
}

impl FontRenderer {
    pub fn new(config: Arc<RenderConfig>, source: Arc<SystemSource>) -> Self {
        Self { config, source }
    }

    pub fn render(&self, family: &str, weight_val: i32) -> Result<()> {
        let properties = Properties { weight: Weight(weight_val as f32), ..Default::default() };
        let handle = self.source.select_best_match(&[FamilyName::Title(family.to_string())], &properties)?;
        let font = handle.load()?;
        
        // Validate weight: font-kit's select_best_match is very permissive.
        // We want to ensure the actual font weight is close to what we requested.
        let actual_weight = font.properties().weight.0 as i32;
        if actual_weight - weight_val > 50 || actual_weight - weight_val <= -50 {
            return Err(AppError::Font(format!(
                "Weight mismatch for family {}: requested {}, got {}",
                family, weight_val, actual_weight
            )));
        }

        let full_name = font.full_name();
        let metrics = font.metrics();
        let scale = self.config.font_size / metrics.units_per_em as f32;

        let mut glyph_data = Vec::new();
        let replacement_gid = font.glyph_for_char('\u{FFFD}');
        for ch in self.config.text.chars() {
            let gid = font.glyph_for_char(ch).ok_or_else(|| AppError::Font(format!("No glyph for {}", ch)))?;
            
            // Check if it's a fallback/missing glyph (tofu).
            // 1. GID 0 is typically the .notdef glyph.
            // 2. If it matches the replacement character glyph (U+FFFD) but isn't that character, it's a fallback.
            if gid == 0 || (replacement_gid == Some(gid) && ch != '\u{FFFD}') {
                return Err(AppError::Font(format!("Font fallback (tofu) detected for character '{}'", ch)));
            }

            let advance = font.advance(gid)?;
            let bounds = font.typographic_bounds(gid)?;
            glyph_data.push((gid, (advance.x() * scale) as i32, bounds.max_y() * scale, bounds.min_y() * scale));
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

        if canvas.pixels.iter().all(|&p| p == 0) { return Ok(()); }

        // Find available weights for metadata
        let available_weights = self.source.select_family_by_name(family)
            .map(|f| {
                f.fonts().iter()
                    .filter_map(|h| h.load().ok())
                    .map(|f| format!("{:?}", f.properties().weight))
                    .collect()
            })
            .unwrap_or_default();

        // Extract localized names using ttf-parser
        let mut localized_names = HashMap::new();
        if let Some(font_data) = font.copy_font_data() {
            if let Ok(ttf_font) = ttf_parser::Face::parse(&font_data, 0) {
                for name_record in ttf_font.names() {
                    let priority = match name_record.name_id {
                        16 => 2, // Preferred Family (Typographic Family)
                        1 => 1,  // Family Name
                        _ => 0,
                    };

                    if priority > 0 {
                        if let Some(name_str) = name_record.to_string() {
                            let lang = match (name_record.platform_id, name_record.language_id) {
                                (ttf_parser::PlatformId::Macintosh, 0) => "en",
                                (ttf_parser::PlatformId::Windows, 0x0409) => "en",
                                (ttf_parser::PlatformId::Windows, 0x0411) => "ja",
                                (ttf_parser::PlatformId::Windows, 0x0412) => "ko",
                                (ttf_parser::PlatformId::Windows, 0x0804) => "zh-CN",
                                (ttf_parser::PlatformId::Windows, 0x0404) => "zh-TW",
                                _ => continue,
                            };

                            // Overwrite only if higher priority, or if same priority but current is missing
                            let entry = localized_names.entry(lang.to_string()).or_insert((0, String::new()));
                            if priority >= entry.0 {
                                *entry = (priority, name_str);
                            }
                        }
                    }
                }
            }
        }

        let localized_names_map: HashMap<String, String> = localized_names.into_iter()
            .map(|(k, (_, v))| (k, v))
            .collect();

        let safe_name = format!("{}_{}", weight_val, family.replace(' ', "_").replace('/', "_"));
        save_font_metadata(&self.config.output_dir, &FontMetadata {
            safe_name: safe_name.clone(),
            display_name: full_name,
            family: family.to_string(),
            localized_names: localized_names_map,
            weight: weight_val,
            weights: available_weights,
            computed: None,
        })?;

        let path = self.config.output_dir.join(safe_name).join("sample.png");
        let writer = BufWriter::new(File::create(path)?);
        let encoder = image::codecs::png::PngEncoder::new_with_quality(writer, image::codecs::png::CompressionType::Fast, image::codecs::png::FilterType::NoFilter);
        encoder.write_image(&canvas.pixels, total_width as u32, height as u32, image::ExtendedColorType::L8)?;

        Ok(())
    }
}