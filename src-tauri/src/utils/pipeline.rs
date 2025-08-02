//! Pipeline composition utilities for chaining operations

use crate::error::FontResult;
use std::path::PathBuf;

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

/// Creates a text processing function that uses provided text or default
pub fn with_text_or_default(default_text: &str) -> impl Fn(Option<String>) -> String + '_ {
    move |text| text.unwrap_or_else(|| default_text.to_string())
}

/// Creates a path formatter function
pub fn format_completion_message(operation_name: &str) -> impl Fn(PathBuf) -> String + '_ {
    move |path| format!("{} completed in: {}", operation_name, path.display())
}