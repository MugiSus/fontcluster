//! Utility functions for functional programming patterns and common operations
//! 
//! This module provides:
//! - Event emission helpers  
//! - Pipeline composition functions

pub mod event_utils;
pub mod pipeline;

pub use event_utils::*;
pub use pipeline::*;