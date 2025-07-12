// Module declarations
pub mod error;
pub mod config;
pub mod commands;
pub mod core;
pub mod rendering;
pub mod utils;

// Re-exports for public API
pub use commands::*;

use tauri::{
    menu::{Menu, MenuItem}, 
    AppHandle, Emitter
};

/// Creates the application menu with session management
fn create_menu(app_handle: &AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    let restore_sessions = MenuItem::with_id(app_handle, "restore_sessions", "Restore Recent Session...", true, None::<&str>)?;
    
    // Start with default menu (includes Edit, View, Window menus with standard shortcuts)
    let menu = Menu::default(app_handle)?;
    
    // Add our custom menu item to the Window menu
    if let Some(window_submenu) = menu.get("Window") {
        window_submenu.as_submenu_unchecked().append(&restore_sessions)?;
    }
    
    Ok(menu)
}

/// Handles menu events
fn handle_menu_event(app_handle: &AppHandle, event: tauri::menu::MenuEvent) {
    match event.id().as_ref() {
        "restore_sessions" => {
            // Emit event to frontend to show session selection dialog
            app_handle.emit("show_session_selection", ())
                .unwrap_or_else(|e| eprintln!("Failed to emit session selection event: {}", e));
        }
        _ => {}
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let menu = create_menu(app.handle())?;
            app.set_menu(menu)?;
            Ok(())
        })
        .on_menu_event(handle_menu_event)
        .invoke_handler(tauri::generate_handler![
            greet, 
            get_system_fonts, 
            generate_font_images, 
            vectorize_font_images, 
            compress_vectors_to_2d,
            cluster_compressed_vectors,
            get_compressed_vectors,
            get_fonts_config,
            get_font_config,
            get_session_id,
            get_session_directory,
            create_new_session,
            create_new_session_with_text,
            get_available_sessions,
            restore_session,
            get_current_session_info,
            cleanup_old_sessions,
            get_session_fonts,
            run_jobs
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}