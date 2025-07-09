use std::path::PathBuf;

// Constants
pub const PREVIEW_TEXT: &str = "A quick brown fox jumps over the lazy dog";
pub const FONT_SIZE: f32 = 96.0;
pub const GLYPH_PADDING: f32 = 4.0;

// Configuration structures
#[derive(Debug, Clone)]
pub struct FontImageConfig {
    pub text: String,
    pub font_size: f32,
    pub output_dir: PathBuf,
}

#[derive(Debug)]
pub struct GlyphMetrics {
    pub glyph_id: u32,
    pub width: i32,
    pub height: i32,
    pub max_y: f32,
}

pub type GlyphData = (font_kit::loaders::default::Font, Vec<GlyphMetrics>, pathfinder_geometry::vector::Vector2I);