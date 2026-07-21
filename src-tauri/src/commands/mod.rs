//! Tauri command handlers invoked from the webview.
//!
//! Each submodule groups the commands for one feature area: [`font`] (browser
//! and previews), [`jobs`] (running/stopping the pipeline), [`plugin`] (the
//! plugin bridge) and [`session`] (session lifecycle). [`progress`] holds shared
//! progress-reporting helpers rather than commands. The handlers are
//! registered in [`crate::run`].

pub mod font;
pub mod jobs;
pub mod model;
pub mod plugin;
pub mod progress;
pub mod session;

pub use font::*;
pub use jobs::*;
pub use model::*;
pub use plugin::*;
pub use progress::*;
pub use session::*;
