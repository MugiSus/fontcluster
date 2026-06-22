//! Domain core: the processing pipeline, session storage and shared state.
//!
//! The pipeline stages run in order — [`discoverer`] → [`sample_renderer`] →
//! [`analyzer`] → [`positioner`] → [`clusterer`] — operating on the session
//! state owned by [`session`]. Supporting modules cover event reporting
//! ([`events`]), the plugin bridge ([`plugin_bridge`]), Google Fonts
//! downloading ([`google_fonts_downloader`]) and example-session seeding
//! ([`example`]). Each submodule's contents are re-exported at the crate's
//! `core` path for convenience.

pub mod analyzer;
pub mod clusterer;
pub mod discoverer;
pub mod events;
pub mod example;
pub mod google_fonts_downloader;
pub mod plugin_bridge;
pub mod positioner;
pub mod sample_renderer;
pub mod session;

pub use analyzer::*;
pub use clusterer::*;
pub use discoverer::*;
pub use events::*;
pub use example::*;
pub use google_fonts_downloader::*;
pub use plugin_bridge::*;
pub use positioner::*;
pub use sample_renderer::*;
pub use session::*;
