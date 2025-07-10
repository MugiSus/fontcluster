# CLAUDELOG-250711-04

## `2025/07/11 04:58:58 (UTC+9)` - mugisus

**mugisus:** Find where the original font names are processed in the compressor.rs file. Look for where font names are converted from file names to safe names, and where we need to preserve the original font names alongside the safe names.

**Claude:** Based on my analysis of the fontcluster codebase, I've found the complete flow of font name processing and identified where original font names are converted to safe names. Here's the detailed breakdown:

## Font Name Processing Flow

### 1. **Font Generation Phase** (`/Users/mugisus/Documents/GitHub/fontcluster/src-tauri/src/rendering/font_renderer.rs`)

**Location**: Lines 155-176 in `save_image()` method

```rust
fn save_image(
    &self,
    img_buffer: ImageBuffer<Rgba<u8>, Vec<u8>>,
    family_name: &str,
) -> FontResult<()> {
    // ... image validation code ...
    
    let safe_name = family_name.replace(" ", "_").replace("/", "_");  // ← CONVERSION POINT
    let images_dir = FontService::get_images_directory()?;
    let output_path = images_dir.join(format!("{}.png", safe_name));
    
    // ... save logic ...
    
    println!("Saved font image: {} -> {}", family_name, output_path.display());
    Ok(())
}
```

**What happens**: Original font family names (e.g., "Arial Bold", "Times/Roman") are converted to safe filenames by replacing spaces with underscores and forward slashes with underscores (e.g., "Arial_Bold", "Times_Roman").

### 2. **Vectorization Phase** (`/Users/mugisus/Documents/GitHub/fontcluster/src-tauri/src/core/vectorizer.rs`)

**Location**: Lines 148-154 in `get_vector_file_path()` method

```rust
fn get_vector_file_path(&self, png_path: &PathBuf) -> PathBuf {
    let vector_dir = FontService::get_vectors_directory().unwrap_or_else(|_| PathBuf::from("."));
    let file_name = png_path.file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("unknown");
    vector_dir.join(format!("{}.csv", file_name))
}
```

**What happens**: The vectorizer takes the PNG file names (which are already safe names) and uses the file stem (filename without extension) to create vector CSV files with the same safe names.

### 3. **Compression Phase** (`/Users/mugisus/Documents/GitHub/fontcluster/src-tauri/src/core/compressor.rs`)

**Location**: Lines 33-54 in `compress_all()` method

```rust
let vector_tasks: Vec<_> = vector_files.into_iter()
    .filter_map(|vector_path| {
        vector_path.file_stem()
            .and_then(|s| s.to_str())
            .map(|stem| {
                let stem = stem.to_string();  // ← SAFE NAME USED
                let path = vector_path.clone();
                task::spawn_blocking(move || {
                    match VectorCompressor::read_vector_file_static(&path) {
                        Ok(vector) => {
                            println!("✓ Vector file '{}' loaded successfully ({} dimensions)", stem, vector.len());
                            Some((stem, vector))  // ← SAFE NAME STORED
                        },
                        // ... error handling ...
                    }
                })
            })
    })
    .collect();
```

**Location**: Lines 158-176 in `compress_vectors_to_2d()` method for saving

```rust
// Save compressed vectors in parallel (format: FontName,X,Y)
println!("Creating {} parallel save tasks...", save_data.len());
let save_tasks: Vec<_> = save_data.into_iter().map(|(font_name, x, y)| {
    let comp_vector_dir = comp_vector_dir.clone();
    task::spawn_blocking(move || {
        let file_path = comp_vector_dir.join(format!("{}.csv", font_name));
        
        let mut file = fs::File::create(&file_path)
            .map_err(|e| FontError::Vectorization(format!("Failed to create compressed vector file: {}", e)))?;
        
        // Write in format: FontName,X,Y
        writeln!(file, "{},{},{}", font_name, x, y)  // ← SAFE NAME WRITTEN TO FILE
            .map_err(|e| FontError::Vectorization(format!("Failed to write compressed vector: {}", e)))?;
```

## Key Findings

### **The Problem**: Original Font Names Are Lost

1. **Initial Conversion**: In `font_renderer.rs`, original font family names are converted to safe names for file storage
2. **Propagation**: These safe names propagate through the entire pipeline (vectorization → compression)
3. **Final Output**: The compressed vector files contain only safe names, not original font names

### **Critical Locations for Preservation**

To preserve original font names alongside safe names, you need to modify these locations:

1. **Primary Conversion Point** (`font_renderer.rs:166`):
   ```rust
   let safe_name = family_name.replace(" ", "_").replace("/", "_");
   ```

2. **Compressor Input Processing** (`compressor.rs:38-44`):
   ```rust
   let stem = stem.to_string();  // This is the safe name
   ```

3. **Compressed Vector Output Format** (`compressor.rs:169`):
   ```rust
   writeln!(file, "{},{},{}", font_name, x, y)  // font_name is safe name
   ```

### **Suggested Solution Strategy**

To preserve original names, you would need to:

1. Create a mapping between safe names and original names during the font rendering phase
2. Store this mapping (possibly in a separate metadata file)
3. Modify the compressor to either:
   - Use the original names in the output format, or
   - Include both safe and original names in the compressed vector files
   - Store the mapping alongside the compressed vectors for frontend use

The current architecture processes files sequentially through the pipeline using filenames as the primary identifier, which naturally loses the original font family names after the first conversion step.