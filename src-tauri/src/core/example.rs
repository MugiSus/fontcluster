use crate::error::Result;
use crate::core::AppState;
use std::fs;
use tauri::AppHandle;
use tauri::Manager;

pub fn extract_example_session(app: &AppHandle) -> Result<Option<String>> {
    let zip_name = "019bf61b-37d4-70a1-ace5-b4aaded78fab.zip";
    let session_id = "019bf61b-37d4-70a1-ace5-b4aaded78fab";
    
    let resource_path = app.path().resolve(
        format!("resources/example/{}", zip_name),
        tauri::path::BaseDirectory::Resource
    ).map_err(|e| crate::error::AppError::Io(format!("Failed to resolve example zip: {}", e)))?;

    if !resource_path.exists() {
        println!("⚠️ Example zip not found at: {}", resource_path.display());
        return Ok(None);
    }

    let dest_dir = AppState::get_base_dir()?.join("Generated");
    if !dest_dir.exists() {
        fs::create_dir_all(&dest_dir).map_err(|e| crate::error::AppError::Io(format!("Failed to create Generated dir: {}", e)))?;
    }

    println!("📦 Extracting example session from {}...", resource_path.display());

    let file = fs::File::open(&resource_path).map_err(|e| crate::error::AppError::Io(format!("Failed to open zip: {}", e)))?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| crate::error::AppError::Processing(format!("Invalid zip: {}", e)))?;

    for i in 0..archive.len() {
        let mut file = archive.by_index(i).map_err(|e| crate::error::AppError::Processing(format!("Failed to read zip index {}: {}", i, e)))?;
        let outpath = match file.enclosed_name() {
            Some(path) => dest_dir.join(path),
            None => continue,
        };

        if file.name().ends_with('/') {
            fs::create_dir_all(&outpath).map_err(|e| crate::error::AppError::Io(format!("Failed to create dir {}: {}", outpath.display(), e)))?;
        } else {
            if let Some(p) = outpath.parent() {
                if !p.exists() {
                    fs::create_dir_all(p).map_err(|e| crate::error::AppError::Io(format!("Failed to create parent dir {}: {}", p.display(), e)))?;
                }
            }
            let mut outfile = fs::File::create(&outpath).map_err(|e| crate::error::AppError::Io(format!("Failed to create file {}: {}", outpath.display(), e)))?;
            std::io::copy(&mut file, &mut outfile).map_err(|e| crate::error::AppError::Io(format!("Failed to copy file contents: {}", e)))?;
        }
    }

    println!("✅ Example session extracted successfully!");
    Ok(Some(session_id.to_string()))
}
