use font_kit::source::SystemSource;
use font_kit::canvas::{Canvas, Format, RasterizationOptions};
use font_kit::family_name::FamilyName;
use font_kit::hinting::HintingOptions;
use font_kit::properties::Properties;
use pathfinder_geometry::transform2d::Transform2F;
use pathfinder_geometry::vector::{Vector2F, Vector2I};
use image::{ImageBuffer, Rgba, GrayImage};
use std::collections::HashSet;
use std::fs;
use std::path::PathBuf;
use tokio::task;
use futures::future::join_all;
use tauri::Emitter;
use std::io::Write;
use imageproc::hog::*;
use nalgebra::DMatrix;

// Error handling
type FontResult<T> = Result<T, FontError>;

#[derive(Debug, thiserror::Error)]
enum FontError {
    #[error("Font loading failed: {0}")]
    FontLoad(String),
    #[error("Image generation failed: {0}")]
    ImageGeneration(String),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Font selection failed: {0}")]
    FontSelection(String),
    #[error("Glyph processing failed: {0}")]
    GlyphProcessing(String),
    #[error("Vectorization failed: {0}")]
    Vectorization(String),
}

// Tauri command handlers
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn get_system_fonts() -> Vec<String> {
    FontService::get_system_fonts()
}

// Constants
const PREVIEW_TEXT: &str = "A quick brown fox jumps over the lazy dog";
const FONT_SIZE: f32 = 96.0;
const GLYPH_PADDING: f32 = 4.0;

// Configuration structures
#[derive(Debug, Clone)]
struct FontImageConfig {
    text: String,
    font_size: f32,
    output_dir: PathBuf,
}

#[derive(Debug)]
struct GlyphMetrics {
    glyph_id: u32,
    width: i32,
    height: i32,
    // min_y: f32,
    max_y: f32,
}

type GlyphData = (font_kit::loaders::default::Font, Vec<GlyphMetrics>, Vector2I);

#[tauri::command]
async fn generate_font_images(text: Option<String>, app_handle: tauri::AppHandle) -> Result<String, String> {
    let generator = FontImageGenerator::new(text, FONT_SIZE)
        .map_err(|e| format!("Failed to initialize generator: {}", e))?;
    
    match generator.generate_all().await {
        Ok(output_dir) => {
            if let Err(e) = app_handle.emit("font_generation_complete", ()) {
                eprintln!("Failed to emit completion event: {}", e);
            }
            Ok(format!("Font images generated in: {}", output_dir.display()))
        }
        Err(e) => Err(format!("Font generation failed: {}", e))
    }
}

#[tauri::command]
async fn vectorize_font_images(app_handle: tauri::AppHandle) -> Result<String, String> {
    let vectorizer = FontImageVectorizer::new()
        .map_err(|e| format!("Failed to initialize vectorizer: {}", e))?;
    
    match vectorizer.vectorize_all().await {
        Ok(output_dir) => {
            if let Err(e) = app_handle.emit("vectorization_complete", ()) {
                eprintln!("Failed to emit vectorization completion event: {}", e);
            }
            Ok(format!("Font images vectorized in: {}", output_dir.display()))
        }
        Err(e) => Err(format!("Vectorization failed: {}", e))
    }
}

#[tauri::command]
async fn compress_vectors_to_2d(app_handle: tauri::AppHandle) -> Result<String, String> {
    let compressor = VectorCompressor::new()
        .map_err(|e| format!("Failed to initialize compressor: {}", e))?;
    
    match compressor.compress_all().await {
        Ok(output_dir) => {
            if let Err(e) = app_handle.emit("compression_complete", ()) {
                eprintln!("Failed to emit compression completion event: {}", e);
            }
            Ok(format!("Vectors compressed to 2D in: {}", output_dir.display()))
        }
        Err(e) => Err(format!("Vector compression failed: {}", e))
    }
}

#[tauri::command]
fn get_compressed_vectors() -> Result<Vec<(String, f64, f64)>, String> {
    let comp_vector_dir = FontService::get_comp_vector_directory()
        .map_err(|e| format!("Failed to get compressed vector directory: {}", e))?;
    
    let mut coordinates = Vec::new();
    
    for entry in fs::read_dir(&comp_vector_dir).map_err(|e| format!("Failed to read directory: {}", e))? {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let path = entry.path();
        
        if path.extension().and_then(|ext| ext.to_str()) == Some("csv") {
            if let Some(font_name) = path.file_stem().and_then(|s| s.to_str()) {
                match fs::read_to_string(&path) {
                    Ok(content) => {
                        let values: Vec<&str> = content.trim().split(',').collect();
                        if values.len() >= 2 {
                            if let (Ok(x), Ok(y)) = (values[0].parse::<f64>(), values[1].parse::<f64>()) {
                                coordinates.push((font_name.to_string(), x, y));
                            }
                        }
                    }
                    Err(e) => eprintln!("Failed to read file {}: {}", path.display(), e),
                }
            }
        }
    }
    
    Ok(coordinates)
}

// Service layer for font operations
struct FontService;

impl FontService {
    fn get_system_fonts() -> Vec<String> {
        let source = SystemSource::new();
        let mut font_families = HashSet::new();
        
        match source.all_families() {
            Ok(families) => {
                font_families.extend(families.iter().map(|f| f.to_string()));
            }
            Err(_) => {
                return Vec::new();
            }
        }
        
        let mut fonts: Vec<String> = font_families.into_iter().collect();
        fonts.sort();
        fonts.dedup();
        fonts
    }
    
    fn create_output_directory() -> FontResult<PathBuf> {
        let app_data_dir = dirs::data_dir()
            .ok_or_else(|| FontError::Io(std::io::Error::new(
                std::io::ErrorKind::NotFound,
                "Failed to get app data directory"
            )))?
            .join("FontCluster")
            .join("Generated");
        
        // Create subdirectories
        let images_dir = app_data_dir.join("Images");
        let vector_dir = app_data_dir.join("Vector");
        let comp_vector_dir = app_data_dir.join("CompVector");
        
        fs::create_dir_all(&images_dir)?;
        fs::create_dir_all(&vector_dir)?;
        fs::create_dir_all(&comp_vector_dir)?;
        
        Ok(app_data_dir)
    }
    
    fn get_images_directory() -> FontResult<PathBuf> {
        Ok(Self::create_output_directory()?.join("Images"))
    }
    
    fn get_vector_directory() -> FontResult<PathBuf> {
        Ok(Self::create_output_directory()?.join("Vector"))
    }
    
    fn get_comp_vector_directory() -> FontResult<PathBuf> {
        Ok(Self::create_output_directory()?.join("CompVector"))
    }
}

// Main font image generation orchestrator
struct FontImageGenerator {
    config: FontImageConfig,
}

impl FontImageGenerator {
    fn new(text: Option<String>, font_size: f32) -> FontResult<Self> {
        let config = FontImageConfig {
            text: text.unwrap_or_else(|| PREVIEW_TEXT.to_string()),
            font_size,
            output_dir: FontService::create_output_directory()?,
        };
        
        Ok(Self { config })
    }
    
    async fn generate_all(&self) -> FontResult<PathBuf> {
        let font_families = FontService::get_system_fonts();
        
        let tasks = self.spawn_font_processing_tasks(font_families);
        join_all(tasks).await;
        
        Ok(self.config.output_dir.clone())
    }
    
    fn spawn_font_processing_tasks(
        &self,
        font_families: Vec<String>,
    ) -> Vec<task::JoinHandle<()>> {
        font_families
            .into_iter()
            .map(|family_name| {
                let config_clone = self.config.clone();
                
                task::spawn_blocking(move || {
                    let renderer = FontRenderer::new(&config_clone);
                    if let Err(e) = renderer.generate_font_image(&family_name) {
                        eprintln!("Failed to generate image for {}: {}", family_name, e);
                    }
                })
            })
            .collect()
    }
}

// Font rendering engine
struct FontRenderer<'a> {
    config: &'a FontImageConfig,
    source: SystemSource,
}

impl<'a> FontRenderer<'a> {
    fn new(config: &'a FontImageConfig) -> Self {
        Self {
            config,
            source: SystemSource::new(),
        }
    }
    
    fn generate_font_image(&self, family_name: &str) -> FontResult<()> {
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
                    // min_y: scaled_min_y,
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
            
            if let Err(e) = font.rasterize_glyph(
                &mut canvas,
                glyph.glyph_id,
                self.config.font_size,
                transform,
                HintingOptions::None,
                RasterizationOptions::GrayscaleAa,
            ) {
                eprintln!("Failed to rasterize glyph: {}", e);
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
        let safe_name = family_name.replace(" ", "_").replace("/", "_");
        let images_dir = FontService::get_images_directory()?;
        let output_path = images_dir.join(format!("{}.png", safe_name));
        
        img_buffer
            .save(&output_path)
            .map_err(|e| FontError::ImageGeneration(format!("Failed to save image: {}", e)))?;
        
        println!("Saved font image: {} -> {}", family_name, output_path.display());
        Ok(())
    }
}

// Image vectorization service
struct FontImageVectorizer {
    output_dir: PathBuf,
}

impl FontImageVectorizer {
    fn new() -> FontResult<Self> {
        let output_dir = FontService::get_images_directory()?;
        Ok(Self { output_dir })
    }
    
    async fn vectorize_all(&self) -> FontResult<PathBuf> {
        let png_files = self.get_png_files()?;
        println!("Found {} PNG files to vectorize", png_files.len());
        
        let tasks = self.spawn_vectorization_tasks(png_files);
        let results = join_all(tasks).await;
        
        // Count successful vectorizations
        let success_count = results.into_iter()
            .filter(|r| matches!(r, Ok(Ok(_))))
            .count();
        
        println!("Successfully vectorized {} images", success_count);
        
        Ok(self.output_dir.clone())
    }
    
    fn get_png_files(&self) -> FontResult<Vec<PathBuf>> {
        let mut png_files = Vec::new();
        
        for entry in fs::read_dir(&self.output_dir)? {
            let entry = entry?;
            let path = entry.path();
            
            if path.extension().and_then(|ext| ext.to_str()) == Some("png") {
                png_files.push(path);
            }
        }
        
        Ok(png_files)
    }
    
    fn spawn_vectorization_tasks(&self, png_files: Vec<PathBuf>) -> Vec<task::JoinHandle<FontResult<Vec<f32>>>> {
        png_files
            .into_iter()
            .map(|png_path| {
                task::spawn_blocking(move || {
                    let vectorizer = ImageVectorizer::new();
                    vectorizer.vectorize_image(&png_path)
                })
            })
            .collect()
    }
}

// Vector compression service
struct VectorCompressor {
    vector_dir: PathBuf,
    comp_vector_dir: PathBuf,
}

impl VectorCompressor {
    fn new() -> FontResult<Self> {
        let vector_dir = FontService::get_vector_directory()?;
        let comp_vector_dir = FontService::get_comp_vector_directory()?;
        Ok(Self { vector_dir, comp_vector_dir })
    }
    
    async fn compress_all(&self) -> FontResult<PathBuf> {
        let vector_files = self.get_vector_files()?;
        println!("Found {} vector files to compress", vector_files.len());
        
        if vector_files.is_empty() {
            return Err(FontError::Vectorization("No vector files found".to_string()));
        }
        
        // Read all vectors
        let mut vectors = Vec::new();
        let mut font_names = Vec::new();
        
        for vector_path in vector_files {
            if let Some(stem) = vector_path.file_stem().and_then(|s| s.to_str()) {
                match self.read_vector_file(&vector_path) {
                    Ok(vector) => {
                        font_names.push(stem.to_string());
                        vectors.push(vector);
                    }
                    Err(e) => eprintln!("Failed to read vector file {}: {}", vector_path.display(), e),
                }
            }
        }
        
        if vectors.is_empty() {
            return Err(FontError::Vectorization("No valid vectors found".to_string()));
        }
        
        // Perform PCA compression in a blocking task
        let comp_vector_dir = self.comp_vector_dir.clone();
        let compression_task = task::spawn_blocking(move || {
            Self::compress_vectors_to_2d(&vectors, &font_names, &comp_vector_dir)
        });
        
        compression_task.await
            .map_err(|e| FontError::Vectorization(format!("Compression task failed: {}", e)))??;
        
        Ok(self.comp_vector_dir.clone())
    }
    
    fn get_vector_files(&self) -> FontResult<Vec<PathBuf>> {
        let mut vector_files = Vec::new();
        
        for entry in fs::read_dir(&self.vector_dir)? {
            let entry = entry?;
            let path = entry.path();
            
            if path.extension().and_then(|ext| ext.to_str()) == Some("csv") {
                vector_files.push(path);
            }
        }
        
        Ok(vector_files)
    }
    
    fn read_vector_file(&self, path: &PathBuf) -> FontResult<Vec<f32>> {
        let content = fs::read_to_string(path)
            .map_err(|e| FontError::Vectorization(format!("Failed to read vector file: {}", e)))?;
        
        let values: Result<Vec<f32>, _> = content.trim().split(',')
            .map(|s| s.parse::<f32>())
            .collect();
        
        values.map_err(|e| FontError::Vectorization(format!("Failed to parse vector values: {}", e)))
    }

    fn compress_vectors_to_2d(vectors: &[Vec<f32>], font_names: &[String], comp_vector_dir: &PathBuf) -> FontResult<()> {
        if vectors.is_empty() || vectors[0].is_empty() {
            return Err(FontError::Vectorization("No valid vectors to compress".to_string()));
        }
        
        let n_samples = vectors.len();
        let n_features = vectors[0].len();
        
        // Create matrix from vectors (rows are samples, columns are features)
        let mut matrix_data = Vec::with_capacity(n_samples * n_features);
        for vector in vectors {
            for &value in vector {
                matrix_data.push(value as f64);
            }
        }
        
        let matrix = DMatrix::from_row_slice(n_samples, n_features, &matrix_data);
        
        // Center the data (subtract column means)
        let mut col_means = Vec::with_capacity(n_features);
        for col in 0..n_features {
            let col_sum: f64 = (0..n_samples).map(|row| matrix[(row, col)]).sum();
            col_means.push(col_sum / n_samples as f64);
        }
        
        let centered = matrix.map_with_location(|_row, col, val| val - col_means[col]);
        
        // Compute SVD for PCA
        let svd = centered.svd(true, false);
        
        // Take first 2 components (first 2 columns of U matrix)
        let u = svd.u.ok_or_else(|| FontError::Vectorization("SVD failed to compute U matrix".to_string()))?;
        
        // Save compressed vectors
        for (i, font_name) in font_names.iter().enumerate() {
            let comp_vector = vec![
                u[(i, 0)] as f32,
                if u.ncols() > 1 { u[(i, 1)] as f32 } else { 0.0 }
            ];
            
            let file_path = comp_vector_dir.join(format!("{}.csv", font_name));
            
            let mut file = fs::File::create(&file_path)
                .map_err(|e| FontError::Vectorization(format!("Failed to create compressed vector file: {}", e)))?;
            
            let csv_line = comp_vector.iter()
                .map(|v| v.to_string())
                .collect::<Vec<String>>()
                .join(",");
            
            writeln!(file, "{}", csv_line)
                .map_err(|e| FontError::Vectorization(format!("Failed to write compressed vector: {}", e)))?;
        }
        
        println!("Compressed {} vectors to 2D and saved to CompVector directory", font_names.len());
        Ok(())
    }
}

// Individual image vectorization processor
struct ImageVectorizer;

impl ImageVectorizer {
    fn new() -> Self {
        Self
    }
    
    fn vectorize_image(&self, png_path: &PathBuf) -> FontResult<Vec<f32>> {
        // Load image using standard image crate
        let img = image::open(png_path)
            .map_err(|e| FontError::Vectorization(format!("Failed to open image {}: {}", png_path.display(), e)))?;
        
        // Convert to grayscale
        let gray_img = img.to_luma8();
        
        // Extract HOG features using imageproc
        let feature_vector = self.extract_hog_features(&gray_img)?;
        
        // Save vector to Vector directory
        self.save_vector_to_file(&feature_vector, png_path)?;
        
        println!("Vectorized: {} -> {} (HOG features: {})", 
                png_path.display(), 
                self.get_vector_file_path(png_path).display(),
                feature_vector.len());
        
        Ok(feature_vector)
    }
    
    fn extract_hog_features(&self, img: &GrayImage) -> FontResult<Vec<f32>> {
        // Resize image to standard size for consistent feature dimensions
        let resized_img = image::imageops::resize(
            img,
            128,  // width
            64,   // height
            image::imageops::FilterType::Lanczos3
        );
        
        // Configure HOG parameters
        let hog_options = HogOptions {
            orientations: 9,
            cell_side: 8,
            block_side: 2,
            block_stride: 1,
            signed: false,
        };
        
        // Extract HOG features
        let hog_result = hog(&resized_img, hog_options);
        
        let features = match hog_result {
            Ok(features) => features,
            Err(e) => return Err(FontError::Vectorization(format!("HOG extraction failed: {}", e))),
        };
        
        if features.is_empty() {
            return Err(FontError::Vectorization("HOG feature extraction failed: no features generated".to_string()));
        }
        
        Ok(features)
    }
    
    
    fn save_vector_to_file(&self, vector: &Vec<f32>, png_path: &PathBuf) -> FontResult<()> {
        let vector_path = self.get_vector_file_path(png_path);
        
        let mut file = fs::File::create(&vector_path)
            .map_err(|e| FontError::Vectorization(format!("Failed to create vector file {}: {}", vector_path.display(), e)))?;
        
        // Write vector data as CSV format (comma-separated values in one line)
        let csv_line = vector.iter()
            .map(|v| v.to_string())
            .collect::<Vec<String>>()
            .join(",");
        
        writeln!(file, "{}", csv_line)
            .map_err(|e| FontError::Vectorization(format!("Failed to write vector data: {}", e)))?;
        
        Ok(())
    }
    
    fn get_vector_file_path(&self, png_path: &PathBuf) -> PathBuf {
        let vector_dir = FontService::get_vector_directory().unwrap_or_else(|_| PathBuf::from("."));
        let file_name = png_path.file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("unknown");
        vector_dir.join(format!("{}.csv", file_name))
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![greet, get_system_fonts, generate_font_images, vectorize_font_images, compress_vectors_to_2d, get_compressed_vectors])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
