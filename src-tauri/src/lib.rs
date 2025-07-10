// Module declarations
pub mod error;
pub mod config;
pub mod commands;
pub mod core;
pub mod rendering;
pub mod utils;

// Re-exports for public API
pub use commands::*;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet, 
            get_system_fonts, 
            generate_font_images, 
            vectorize_font_images, 
            compress_vectors_to_2d, 
            get_compressed_vectors,
            get_fonts_config,
            get_font_config,
            get_session_id,
            get_session_directory,
            create_new_session,
            cleanup_old_sessions,
            get_session_fonts
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}