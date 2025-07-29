//! Event emission utilities for functional event handling

use tauri::{AppHandle, Emitter};
use crate::error::FontResult;

/// Functional event emitter that returns a closure
pub fn create_emitter<T: Clone + serde::Serialize + 'static>(
    app_handle: AppHandle,
    event_name: &'static str,
) -> impl Fn(T) -> FontResult<()> {
    move |payload| {
        app_handle.emit(event_name, payload)
            .map_err(|e| crate::error::FontError::Io(
                std::io::Error::new(
                    std::io::ErrorKind::Other,
                    format!("Failed to emit event '{}': {}", event_name, e)
                )
            ))
    }
}

/// Emits completion event for a successful operation
pub fn emit_completion(
    app_handle: &AppHandle,
    event_name: &str,
) -> FontResult<()> {
    app_handle.emit(event_name, ())
        .map_err(|e| crate::error::FontError::Io(
            std::io::Error::new(
                std::io::ErrorKind::Other,
                format!("Failed to emit completion event '{}': {}", event_name, e)
            )
        ))
}

/// Emits completion event with session_id payload
pub fn emit_completion_with_session_id(
    app_handle: &AppHandle,
    event_name: &str,
    session_id: &str,
) -> FontResult<()> {
    app_handle.emit(event_name, session_id)
        .map_err(|e| crate::error::FontError::Io(
            std::io::Error::new(
                std::io::ErrorKind::Other,
                format!("Failed to emit completion event '{}': {}", event_name, e)
            )
        ))
}

/// Creates a function that emits an event and returns the input unchanged
pub fn emit_and_pass_through<T: Clone + serde::Serialize + 'static>(
    app_handle: AppHandle,
    event_name: &'static str,
) -> impl Fn(T) -> FontResult<T> {
    move |value| {
        app_handle.emit(event_name, value.clone())
            .map_err(|e| crate::error::FontError::Io(
                std::io::Error::new(
                    std::io::ErrorKind::Other,
                    format!("Failed to emit event '{}': {}", event_name, e)
                )
            ))?;
        Ok(value)
    }
}

/// Emits progress events with functional composition
pub fn with_progress_events<T, F>(
    app_handle: AppHandle,
    start_event: &str,
    complete_event: &str,
    operation: F,
) -> FontResult<T> 
where
    F: FnOnce() -> FontResult<T>,
{
    emit_completion(&app_handle, start_event)?;
    let result = operation()?;
    emit_completion(&app_handle, complete_event)?;
    Ok(result)
}

/// Async version of with_progress_events
pub async fn with_progress_events_async<T, F, Fut>(
    app_handle: AppHandle,
    start_event: &str,
    complete_event: &str,
    operation: F,
) -> FontResult<T> 
where
    F: FnOnce() -> Fut,
    Fut: std::future::Future<Output = FontResult<T>>,
{
    emit_completion(&app_handle, start_event)?;
    let result = operation().await?;
    
    // Emit completion event with session_id payload
    let session_manager = crate::core::SessionManager::global();
    let session_id = session_manager.get_session_id();
    emit_completion_with_session_id(&app_handle, complete_event, session_id)?;
    
    Ok(result)
}