pub mod error;
pub mod config;
pub mod commands;
pub mod core;
pub mod rendering;

use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem, Submenu, AboutMetadata}, 
    AppHandle, Emitter
};
use crate::core::AppState;

fn create_menu(app: &AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    let restore = MenuItem::with_id(app, "restore_sessions", "Restore Recent Session...", true, None::<&str>)?;
    
    #[cfg(target_os = "macos")]
    {
        let meta = AboutMetadata::default();
        let app_menu = Submenu::with_items(app, "FontCluster", true, &[
            &PredefinedMenuItem::about(app, Some("About FontCluster"), Some(meta))?,
            &PredefinedMenuItem::separator(app)?,
            &restore,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::hide(app, None)?,
            &PredefinedMenuItem::hide_others(app, None)?,
            &PredefinedMenuItem::show_all(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::quit(app, None)?,
        ])?;
        let edit_menu = Submenu::with_items(app, "Edit", true, &[
            &PredefinedMenuItem::undo(app, None)?,
            &PredefinedMenuItem::redo(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::cut(app, None)?,
            &PredefinedMenuItem::copy(app, None)?,
            &PredefinedMenuItem::paste(app, None)?,
            &PredefinedMenuItem::select_all(app, None)?,
        ])?;
        Menu::with_items(app, &[&app_menu, &edit_menu])
    }
    #[cfg(not(target_os = "macos"))]
    {
        Menu::with_items(app, &[&Submenu::with_items(app, "File", true, &[&restore])?])
    }
}

fn handle_menu(app: &AppHandle, event: tauri::menu::MenuEvent) {
    if event.id().as_ref() == "restore_sessions" {
        let _ = app.emit("show_session_selection", ());
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AppState::new())
        .setup(|app| {
            app.set_menu(create_menu(app.handle())?)?;
            Ok(())
        })
        .on_menu_event(handle_menu)
        .invoke_handler(tauri::generate_handler![
            crate::commands::create_new_session,
            crate::commands::get_session_info,
            crate::commands::get_available_sessions,
            crate::commands::get_latest_session_id,
            crate::commands::get_session_directory,
            crate::commands::delete_session,
            crate::commands::run_jobs,
            crate::commands::stop_jobs,
            crate::commands::get_compressed_vectors,
            crate::commands::get_system_fonts,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}