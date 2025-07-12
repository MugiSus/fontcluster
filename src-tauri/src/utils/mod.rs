//! Utility functions for functional programming patterns and common operations
//! 
//! This module provides:
//! - Result transformation utilities
//! - Event emission helpers  
//! - Pipeline composition functions
//! - Pure function helpers

pub mod result_utils;
pub mod event_utils;
pub mod pipeline;

pub use result_utils::*;
pub use event_utils::*;
pub use pipeline::*;

use crate::error::FontResult;

/// Composes two functions f and g into f(g(x))
pub fn compose<A, B, C>(
    f: impl Fn(B) -> C,
    g: impl Fn(A) -> B,
) -> impl Fn(A) -> C {
    move |x| f(g(x))
}

/// Maps a function over the Ok value of a Result
pub fn map_result<T, U, E>(
    result: Result<T, E>,
    f: impl FnOnce(T) -> U,
) -> Result<U, E> {
    result.map(f)
}

/// Chains operations that return Results
pub fn and_then_result<T, U, E>(
    result: Result<T, E>,
    f: impl FnOnce(T) -> Result<U, E>,
) -> Result<U, E> {
    result.and_then(f)
}

/// Converts a closure result to FontResult with context
pub fn to_font_result<T>(
    operation: impl FnOnce() -> Result<T, Box<dyn std::error::Error + Send + Sync>>,
    context: &str,
) -> FontResult<T> {
    operation()
        .map_err(|e| crate::error::FontError::Io(
            std::io::Error::new(
                std::io::ErrorKind::Other,
                format!("{}: {}", context, e)
            )
        ))
}