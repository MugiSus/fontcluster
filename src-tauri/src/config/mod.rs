//! Serialisable data model shared across the backend and the frontend.
//!
//! These types are the on-disk and over-the-wire representation of a session.
//! They are persisted as JSON (`config.json` inside a session directory, plus
//! per-font `meta.json`/`computed.json`) and serialised again when returned
//! from Tauri commands, so their field names and `serde` attributes are part
//! of the application's contract with the UI.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;

/// Text rendered into a sample image when the user has not chosen their own.
pub const DEFAULT_RENDERING_TEXT: &str = "A";
/// Font size, in pixels, used for sample rendering by default.
pub const DEFAULT_FONT_SIZE: f32 = 224.0;

/// Top-level, persisted description of a single clustering session.
///
/// This is the source of truth saved as `config.json`; `app_version` records
/// the version that created the session while `modified_app_version` tracks
/// the version of the last write, which together drive migration pruning.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionConfig {
    pub app_version: String,
    pub modified_app_version: String,
    pub session_id: String,
    pub created_at: DateTime<Utc>,
    pub modified_at: DateTime<Utc>,
    pub discovered_fonts: HashMap<i32, Vec<String>>,
    pub algorithm: AlgorithmConfig,
    pub status: ProcessingStatus,
}

/// User-tunable parameters that fully determine a session's output.
///
/// Split into the two halves of the pipeline: how samples are rendered and how
/// the resulting feature vectors are clustered.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AlgorithmConfig {
    pub rendering: RenderingConfig,
    pub clustering: ClusteringConfig,
}

/// Parameters controlling which fonts are sampled and how they are drawn.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RenderingConfig {
    /// Glyphs rendered into each sample image.
    pub text: String,
    /// Font weights to sample per family (e.g. `[400, 700]`).
    pub weights: Vec<i32>,
    /// Which corpus of fonts to draw from.
    pub font_set: FontSet,
    /// Rendering size in pixels.
    pub font_size: f32,
}

impl Default for RenderingConfig {
    fn default() -> Self {
        Self {
            text: DEFAULT_RENDERING_TEXT.to_string(),
            weights: vec![400],
            font_set: FontSet::default(),
            font_size: DEFAULT_FONT_SIZE,
        }
    }
}

/// Corpus of fonts a session draws from.
///
/// `SystemFonts` enumerates fonts installed on the machine; the `GoogleFonts*`
/// variants download the most popular families from Google Fonts, capped at
/// the indicated count (`All` downloads every match).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum FontSet {
    SystemFonts,
    GoogleFontsPopular100,
    GoogleFontsPopular200,
    GoogleFontsPopular300,
    GoogleFontsPopular500,
    GoogleFontsPopular1000,
    GoogleFontsPopular1500,
    GoogleFontsAll,
}

impl Default for FontSet {
    fn default() -> Self {
        Self::SystemFonts
    }
}

/// Parameters for the agglomerative clustering stage.
///
/// `distance_threshold` and `target_cluster_count` are alternative stop
/// criteria for cutting the dendrogram; a positive `target_cluster_count`
/// takes precedence (see [`crate::core::clusterer`]).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClusteringConfig {
    /// Linkage method used to merge clusters.
    pub method: ClusteringMethod,
    /// Number of PCA dimensions feature vectors are reduced to before
    /// distances are computed.
    pub preprocessing_dimensions: usize,
    /// Maximum linkage distance at which clusters stop merging.
    pub distance_threshold: f32,
    /// Desired final cluster count; `0` means "use `distance_threshold`".
    pub target_cluster_count: usize,
}

/// Linkage criteria supported by the clustering stage, mirroring
/// [`kodama::Method`](https://docs.rs/kodama).
#[derive(Debug, Clone, Copy, Serialize, Deserialize, Default, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ClusteringMethod {
    Single,
    Complete,
    #[default]
    Average,
    Weighted,
    Ward,
    Centroid,
    Median,
}

impl Default for ClusteringConfig {
    fn default() -> Self {
        Self {
            method: ClusteringMethod::Average,
            preprocessing_dimensions: 8,
            distance_threshold: 0.5,
            target_cluster_count: 0,
        }
    }
}

/// The furthest pipeline stage a session has completed.
///
/// The job pipeline advances strictly through these in order, so the value
/// also acts as a resume point when re-running an unfinished session.
#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ProcessStatus {
    #[default]
    Empty,
    Rendered,
    Analyzed,
    Positioned,
    Clustered,
}

/// Runtime status of a session: how far it has progressed and per-stage
/// progress for display.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ProcessingStatus {
    pub process_status: ProcessStatus,
    /// Number of clusters produced by the last clustering run.
    pub clusters_amount: usize,
    /// Number of samples that took part in the last clustering run.
    pub samples_amount: usize,
    /// Free statistics captured by the last clustering run. Empty until a run
    /// completes; `#[serde(default)]` keeps `config.json` files written before
    /// this field existed loadable.
    #[serde(default)]
    pub clustering_stats: ClusteringStats,
    pub progress: ProcessingProgress,
}

/// By-product statistics of a single clustering run, persisted alongside the
/// cluster/sample counts on [`ProcessingStatus`].
///
/// Every field is something the clustering stage already computes and would
/// otherwise discard, recorded so the UI (and future auto-tuning) can inspect
/// run quality without re-clustering. Centroids and heights live in the
/// **normalised PCA space** the clustering ran in — not the 2-D layout space
/// drawn on the graph.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ClusteringStats {
    /// Per-cluster statistics, ordered by cluster id (matching each font's
    /// [`ClusteringData::k`]).
    pub clusters: Vec<ClusterStat>,
    /// Linkage height of the last merge applied before the dendrogram was cut;
    /// `0.0` when no merges were applied.
    pub cut_height: f32,
    /// Dissimilarity of every merge in the full dendrogram, in linkage order.
    /// Lets the UI inspect the gap/elbow around the cut without re-clustering.
    pub merge_heights: Vec<f32>,
}

/// Free per-cluster facts recorded for each cluster a run produces.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClusterStat {
    /// Number of fonts assigned to this cluster.
    pub size: usize,
    /// Cluster centroid in the normalised PCA space the clustering ran in.
    pub centroid: Vec<f32>,
    /// Largest internal merge height within this cluster (its dendrogram
    /// diameter); `0.0` for singletons.
    pub diameter: f32,
}

/// Progress fractions for each pipeline stage, persisted so the UI can render
/// progress bars without subscribing to live events.
#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
pub struct ProcessingProgress {
    pub rendering: ProgressSection,
    pub analysis: ProgressSection,
    pub clustering: ProgressSection,
    pub position: ProgressSection,
}

/// A single `numerator / denominator` progress fraction.
///
/// `denominator` defaults to `1` (rather than `0`) so a freshly created
/// section reads as `0/1` and never divides by zero in the UI.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ProgressSection {
    pub numerator: usize,
    pub denominator: usize,
}

impl Default for ProgressSection {
    fn default() -> Self {
        Self {
            numerator: 0,
            denominator: 1,
        }
    }
}

/// Identifies a pipeline stage when updating its [`ProgressSection`].
///
/// Unlike [`ProcessStatus`] this is an in-memory selector and is never
/// serialised.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ProgressStage {
    Rendering,
    Analysis,
    Clustering,
    Position,
}

/// Per-font results produced by the pipeline, persisted as `computed.json`.
///
/// Every field is optional because it is filled in by a different stage; a
/// font may legitimately have, say, a rendered sample but no clustering yet.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComputedData {
    /// The text that was actually rendered for this font's sample.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rendered_text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub positioning: Option<PositioningData>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub clustering: Option<ClusteringData>,
}

/// 2-D layout coordinate assigned to a font by the positioning stage.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PositioningData {
    pub position: [f32; 2],
}

/// Per-font results assigned by the clustering stage.
///
/// Everything here is a free by-product of the dendrogram replay that derives
/// `k`; `#[serde(default)]` keeps `computed.json` files written before a field
/// existed loadable.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClusteringData {
    /// Zero-based cluster index, or `-1` if the font was left unclustered.
    pub k: i32,
    /// Linkage height at which this font first merged into a larger node in
    /// the full dendrogram — its isolation in the normalised PCA space the
    /// clustering ran in. Higher means more of an outlier; `0.0` for a lone
    /// point.
    #[serde(default)]
    pub join_height: f32,
}

/// Descriptive metadata extracted from a single font face.
///
/// Persisted as `meta.json` and also sent to the UI. `safe_name` is the
/// filesystem-safe identifier used as the per-font directory name; the
/// localised `*_names`/`publishers`/`designers` maps are keyed by BCP-47
/// language tag (with `"und"` for entries that declare no language).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FontMetadata {
    pub source: FontSource,
    pub safe_name: String,
    pub font_name: String,
    pub family_name: String,
    pub family_names: HashMap<String, String>,
    pub preferred_family_names: HashMap<String, String>,
    pub style_name: String,
    pub style_names: HashMap<String, String>,
    pub preferred_style_names: HashMap<String, String>,
    pub publishers: HashMap<String, String>,
    pub designers: HashMap<String, String>,
    pub copyright: Option<String>,
    pub trademark: Option<String>,
    pub version: Option<String>,
    pub postscript_name: Option<String>,
    pub description: Option<String>,
    pub vendor_url: Option<String>,
    pub designer_url: Option<String>,
    pub sample_text: Option<String>,
    pub weight: i32,
    pub weights: Vec<String>,
    pub font_index: u32,
}

/// Where a font face originated, which decides how it is re-loaded for
/// preview rendering (system lookup vs. on-demand Google Fonts download).
#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum FontSource {
    #[default]
    System,
    GoogleFonts,
}

/// A font's metadata paired with any results computed for it so far.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FontData {
    pub meta: FontMetadata,
    pub computed: Option<ComputedData>,
}

impl FontMetadata {
    /// Builds the filesystem-safe identifier for a `(family, weight)` pair.
    ///
    /// The weight is prefixed and path separators in the family name are
    /// replaced with underscores so the result is safe to use as a directory
    /// name and as a stable map key.
    pub fn generate_safe_name(family: &str, weight: i32) -> String {
        format!(
            "{}_{}",
            weight,
            family
                .replace(' ', "_")
                .replace('/', "_")
                .replace('\\', "_")
        )
    }
}

/// Inputs handed to [`crate::rendering::FontRenderer`] for a render pass.
///
/// Unlike the other types here this is purely in-memory plumbing and is never
/// serialised; `output_dir` is the session directory under which `samples/`
/// is written.
#[derive(Debug, Clone)]
pub struct RenderConfig {
    pub text: String,
    pub font_size: f32,
    pub output_dir: PathBuf,
}
