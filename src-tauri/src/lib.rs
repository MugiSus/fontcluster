//! FontCluster backend library crate.
//!
//! Exposes the Tauri application setup ([`run`]) plus the modules that make up
//! the backend:
//! - [`config`] — serialisable session data model;
//! - [`core`] — the processing pipeline, session storage and shared state;
//! - [`commands`] — Tauri command handlers invoked from the webview;
//! - [`rendering`] — font rasterisation;
//! - [`error`] — the shared [`error::AppError`] type.
//!
//! The same crate also powers the headless job worker process; see
//! [`commands::run_jobs_worker`].

pub mod commands;
pub mod config;
pub mod core;
pub mod error;
pub mod rendering;

use crate::commands::font::FontPreviewCacheState;
use crate::core::AppState;
use std::sync::Arc;
#[cfg(target_os = "macos")]
use tauri::menu::AboutMetadata;
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem, Submenu},
    AppHandle, Emitter,
};

/// Builds the native application menu.
///
/// The layout differs per platform: macOS gets the standard app menu with the
/// session/update items, while other platforms fold them into the File menu.
fn create_menu(app: &AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    let restore = MenuItem::with_id(
        app,
        "restore_sessions",
        "Restore Recent Session...",
        true,
        None::<&str>,
    )?;
    let refresh = MenuItem::with_id(app, "refresh", "Refresh", true, Some("CmdOrCtrl+R"))?;
    let check_update = MenuItem::with_id(
        app,
        "check_update",
        "Check for Updates...",
        true,
        None::<&str>,
    )?;
    let undo_history = MenuItem::with_id(
        app,
        "undo_history",
        "Undo History",
        true,
        Some("CmdOrCtrl+Z"),
    )?;
    let redo_history = MenuItem::with_id(
        app,
        "redo_history",
        "Redo History",
        true,
        Some("CmdOrCtrl+Shift+Z"),
    )?;

    let edit_menu = Submenu::with_items(
        app,
        "Edit",
        true,
        &[
            &PredefinedMenuItem::cut(app, None)?,
            &PredefinedMenuItem::copy(app, None)?,
            &PredefinedMenuItem::paste(app, None)?,
            &PredefinedMenuItem::select_all(app, None)?,
        ],
    )?;

    #[cfg(target_os = "macos")]
    {
        let meta = AboutMetadata::default();
        let app_menu = Submenu::with_items(
            app,
            "FontCluster",
            true,
            &[
                &PredefinedMenuItem::about(app, Some("About FontCluster"), Some(meta))?,
                &PredefinedMenuItem::separator(app)?,
                &check_update,
                &PredefinedMenuItem::separator(app)?,
                &restore,
                &refresh,
                &PredefinedMenuItem::separator(app)?,
                &PredefinedMenuItem::hide(app, None)?,
                &PredefinedMenuItem::hide_others(app, None)?,
                &PredefinedMenuItem::show_all(app, None)?,
                &PredefinedMenuItem::separator(app)?,
                &PredefinedMenuItem::quit(app, None)?,
            ],
        )?;
        let file_menu = Submenu::with_items(app, "File", true, &[&undo_history, &redo_history])?;
        Menu::with_items(app, &[&app_menu, &file_menu, &edit_menu])
    }

    #[cfg(not(target_os = "macos"))]
    {
        let file_menu = Submenu::with_items(
            app,
            "File",
            true,
            &[
                &undo_history,
                &redo_history,
                &PredefinedMenuItem::separator(app)?,
                &restore,
                &refresh,
                &check_update,
                &PredefinedMenuItem::separator(app)?,
                &PredefinedMenuItem::quit(app, None)?,
            ],
        )?;
        Menu::with_items(app, &[&file_menu, &edit_menu])
    }
}

/// Translates menu clicks into events the webview listens for.
fn handle_menu(app: &AppHandle, event: tauri::menu::MenuEvent) {
    if event.id().as_ref() == "restore_sessions" {
        let _ = app.emit("show_session_selection", ());
    } else if event.id().as_ref() == "refresh" {
        let _ = app.emit("refresh-requested", ());
    } else if event.id().as_ref() == "check_update" {
        let _ = app.emit("check-update-requested", ());
    } else if event.id().as_ref() == "undo_history" {
        let _ = app.emit("undo-history-requested", ());
    } else if event.id().as_ref() == "redo_history" {
        let _ = app.emit("redo-history-requested", ());
    }
}

/// Builds and runs the Tauri application.
///
/// Performs startup housekeeping (pruning unsupported sessions, reconciling the
/// session cache), starts the plugin bridge server, registers shared state and
/// command handlers, then hands control to the Tauri runtime.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app_state = AppState::new();
    if let Err(error) = AppState::prune_unsupported_sessions() {
        eprintln!("Failed to prune unsupported sessions: {}", error);
    }
    if let Err(error) = AppState::reconcile_session_storage() {
        eprintln!("Failed to reconcile session storage: {}", error);
    }
    crate::core::start_plugin_bridge_server(app_state.clone());

    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_os::init())
        .manage(app_state)
        .manage(Arc::new(FontPreviewCacheState::default()))
        .setup(|app| {
            app.set_menu(create_menu(app.handle())?)?;
            Ok(())
        })
        .on_menu_event(handle_menu)
        .invoke_handler(tauri::generate_handler![
            crate::commands::load_session,
            crate::commands::get_session_history,
            crate::commands::get_running_session_ids,
            crate::commands::get_latest_session_id,
            crate::commands::delete_session,
            crate::commands::run_jobs,
            crate::commands::stop_jobs,
            crate::commands::lasso_selected_process,
            crate::commands::render_font_preview,
            crate::commands::send_font_to_plugin,
            crate::commands::get_connected_plugins,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
