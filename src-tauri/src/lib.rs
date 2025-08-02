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
    menu::{Menu, MenuItem, PredefinedMenuItem, Submenu, AboutMetadata}, 
    AppHandle, Emitter
};

/// Creates the application menu with session management
fn create_menu(app_handle: &AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    let restore_sessions = MenuItem::with_id(app_handle, "restore_sessions", "Restore Recent Session...", true, None::<&str>)?;
    
    // If default menu doesn't work reliably, let's try a different approach
    // Let's build manually but keep it minimal
    #[cfg(target_os = "macos")]
    {
        let about_metadata = AboutMetadata::default();
        
        let app_menu = Submenu::with_items(app_handle, "FontCluster", true, &[
            &PredefinedMenuItem::about(app_handle, Some("About FontCluster"), Some(about_metadata))?,
            &PredefinedMenuItem::separator(app_handle)?,
            &restore_sessions,
            &PredefinedMenuItem::separator(app_handle)?,
            &PredefinedMenuItem::hide(app_handle, None)?,
            &PredefinedMenuItem::hide_others(app_handle, None)?,
            &PredefinedMenuItem::show_all(app_handle, None)?,
            &PredefinedMenuItem::separator(app_handle)?,
            &PredefinedMenuItem::quit(app_handle, None)?,
        ])?;

        let edit_menu = Submenu::with_items(app_handle, "Edit", true, &[
            &PredefinedMenuItem::undo(app_handle, None)?,
            &PredefinedMenuItem::redo(app_handle, None)?,
            &PredefinedMenuItem::separator(app_handle)?,
            &PredefinedMenuItem::cut(app_handle, None)?,
            &PredefinedMenuItem::copy(app_handle, None)?,
            &PredefinedMenuItem::paste(app_handle, None)?,
            &PredefinedMenuItem::select_all(app_handle, None)?,
        ])?;

        let window_menu = Submenu::with_items(app_handle, "Window", true, &[
            &PredefinedMenuItem::minimize(app_handle, None)?,
            &PredefinedMenuItem::close_window(app_handle, None)?,
        ])?;
        
        Menu::with_items(app_handle, &[
            &app_menu,
            &edit_menu,
            &window_menu,
        ])
    }
    
    #[cfg(not(target_os = "macos"))]
    {
        let window_menu = Submenu::with_items(app_handle, "Window", true, &[
            &restore_sessions,
        ])?;
        
        Menu::with_items(app_handle, &[
            &window_menu,
        ])
    }
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
            get_compressed_vectors,
            get_fonts_config,
            get_font_config,
            get_session_id,
            get_session_directory,
            create_new_session,
            create_new_session_with_text,
            get_available_sessions,
            get_latest_session_id,
            get_session_info,
            cleanup_old_sessions,
            get_session_fonts,
            run_jobs
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}