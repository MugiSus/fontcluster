//! Result transformation utilities for functional error handling

use crate::error::{FontResult, FontError};

/// Transforms a generic error to FontError with context
pub fn map_error_with_context<T, E: std::error::Error>(
    context: &str,
) -> impl Fn(Result<T, E>) -> FontResult<T> + '_ {
    move |result| {
        result.map_err(|e| FontError::Io(
            std::io::Error::new(
                std::io::ErrorKind::Other,
                format!("{}: {}", context, e)
            )
        ))
    }
}

/// Transforms a String error to FontError
pub fn string_to_font_error<T>(result: Result<T, String>) -> FontResult<T> {
    result.map_err(|e| FontError::Io(
        std::io::Error::new(std::io::ErrorKind::Other, e)
    ))
}

/// Chains multiple fallible operations
pub fn chain_operations<T>(
    operations: Vec<Box<dyn FnOnce() -> FontResult<T>>>,
) -> FontResult<Vec<T>> {
    operations.into_iter()
        .map(|op| op())
        .collect::<Result<Vec<_>, _>>()
}

/// Applies a function to Result if Ok, preserving the error
pub fn inspect_ok<T, E>(
    result: &Result<T, E>,
    f: impl FnOnce(&T),
) -> &Result<T, E> {
    if let Ok(value) = result {
        f(value);
    }
    result
}

/// Applies a function to Result if Err, preserving the value
pub fn inspect_err<T, E>(
    result: &Result<T, E>,
    f: impl FnOnce(&E),
) -> &Result<T, E> {
    if let Err(error) = result {
        f(error);
    }
    result
}