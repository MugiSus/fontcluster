use std::io;

// Error handling
pub type FontResult<T> = Result<T, FontError>;

#[derive(Debug, thiserror::Error)]
pub enum FontError {
    #[error("Font loading failed: {0}")]
    FontLoad(String),
    #[error("Image generation failed: {0}")]
    ImageGeneration(String),
    #[error("IO error: {0}")]
    Io(#[from] io::Error),
    #[error("Font selection failed: {0}")]
    FontSelection(String),
    #[error("Glyph processing failed: {0}")]
    GlyphProcessing(String),
    #[error("Vectorization failed: {0}")]
    Vectorization(String),
    #[error("Classification failed: {0}")]
    Classification(String),
    #[error("Network error: {0}")]
    NetworkError(String),
}