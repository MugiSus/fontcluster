//! Pipeline composition utilities for chaining operations

use crate::error::FontResult;
use tauri::AppHandle;
use std::path::PathBuf;

/// Represents a processing step in a pipeline
pub type ProcessingStep<T, U> = Box<dyn FnOnce(T) -> FontResult<U>>;

/// Pipeline builder for chaining operations
pub struct Pipeline<T> {
    value: FontResult<T>,
}

impl<T> Pipeline<T> {
    /// Creates a new pipeline with an initial value
    pub fn new(value: T) -> Self {
        Self { 
            value: Ok(value) 
        }
    }
    
    /// Creates a pipeline from a Result
    pub fn from_result(result: FontResult<T>) -> Self {
        Self { value: result }
    }
    
    /// Chains an operation that can fail
    pub fn then<U>(self, f: impl FnOnce(T) -> FontResult<U>) -> Pipeline<U> {
        Pipeline {
            value: self.value.and_then(f)
        }
    }
    
    /// Chains an async operation that can fail
    pub async fn then_async<U, F, Fut>(self, f: F) -> Pipeline<U> 
    where
        F: FnOnce(T) -> Fut,
        Fut: std::future::Future<Output = FontResult<U>>,
    {
        let result = match self.value {
            Ok(value) => f(value).await,
            Err(error) => Err(error),
        };
        Pipeline { value: result }
    }
    
    /// Maps a pure function over the pipeline value
    pub fn map<U>(self, f: impl FnOnce(T) -> U) -> Pipeline<U> {
        Pipeline {
            value: self.value.map(f)
        }
    }
    
    /// Executes a side effect without changing the value
    pub fn inspect(self, f: impl FnOnce(&T)) -> Pipeline<T> {
        if let Ok(ref value) = self.value {
            f(value);
        }
        self
    }
    
    /// Consumes the pipeline and returns the final result
    pub fn execute(self) -> FontResult<T> {
        self.value
    }
}

/// Helper for creating font processing pipelines with events
pub struct FontPipeline {
    app_handle: AppHandle,
}

impl FontPipeline {
    pub fn new(app_handle: AppHandle) -> Self {
        Self { app_handle }
    }
    
    /// Creates a processing step with automatic event emission
    pub fn step<T, U>(
        &self,
        step_name: &str,
        event_name: &str,
        operation: impl FnOnce(T) -> FontResult<U>,
    ) -> impl FnOnce(T) -> FontResult<U> {
        let app_handle = self.app_handle.clone();
        let step_name = step_name.to_string();
        let event_name = event_name.to_string();
        
        move |input| {
            println!("🔄 Executing step: {}", step_name);
            let result = operation(input)?;
            
            crate::utils::emit_completion(&app_handle, &event_name)?;
            println!("✅ Completed step: {}", step_name);
            
            Ok(result)
        }
    }
}

/// Creates a text processing function that uses provided text or default
pub fn with_text_or_default(default_text: &str) -> impl Fn(Option<String>) -> String + '_ {
    move |text| text.unwrap_or_else(|| default_text.to_string())
}

/// Creates a path formatter function
pub fn format_completion_message(operation_name: &str) -> impl Fn(PathBuf) -> String + '_ {
    move |path| format!("{} completed in: {}", operation_name, path.display())
}