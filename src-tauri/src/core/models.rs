//! Model resolution and persistent installation.
//!
//! A model ID is published under the same GitHub Release tag in
//! `MugiSus/fontcluster-models`. Every release carries the same three assets:
//! `model.json`, `model.onnx`, and
//! `attribute_directions.json`. GitHub computes a SHA-256 digest for every
//! asset; downloads are streamed to a staging directory, verified against
//! those digests, validated as one bundle, and atomically renamed into
//! Application Support only after all files pass.

use crate::core::{AppState, EventSink};
use crate::error::{AppError, Result};
use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use serde_json::json;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::time::Duration;

/// GitHub API root for the repository that owns the model releases.
const MODEL_REPOSITORY_API: &str = "https://api.github.com/repos/MugiSus/fontcluster-models";
/// GitHub REST API contract used to interpret release asset metadata.
const GITHUB_API_VERSION: &str = "2026-03-10";
/// Bundle contract understood by this version of the application.
const MODEL_API_VERSION: u32 = 1;
/// Prevents an unexpectedly large manifest from being buffered in memory.
const MAX_MANIFEST_BYTES: u64 = 64 * 1024;
/// The complete and exclusive asset set accepted for one model release.
const REQUIRED_ASSETS: [&str; 3] = ["model.json", "model.onnx", "attribute_directions.json"];
/// Attribute names whose directions must all be present in a compatible bundle.
const EMPHASIS_ATTRIBUTES: [&str; 37] = [
    "angular",
    "artistic",
    "attention-grabbing",
    "attractive",
    "bad",
    "boring",
    "calm",
    "capitals",
    "charming",
    "clumsy",
    "complex",
    "cursive",
    "delicate",
    "disorderly",
    "display",
    "dramatic",
    "formal",
    "fresh",
    "friendly",
    "gentle",
    "graceful",
    "happy",
    "italic",
    "legible",
    "modern",
    "monospace",
    "playful",
    "pretentious",
    "serif",
    "sharp",
    "sloppy",
    "soft",
    "strong",
    "technical",
    "thin",
    "warm",
    "wide",
];

/// Public metadata stored beside every model and published as `model.json`.
///
/// The manifest is the bundle's source of truth for identity, display metadata,
/// compatibility, and the checksums of the two payload files.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelManifest {
    /// Version of the model-bundle contract required to consume this model.
    pub model_api_version: u32,
    /// Stable release and installation-directory identifier.
    pub id: String,
    /// Human-readable name supplied by the model publisher.
    pub name: String,
    /// Optional parameter count supplied by the model publisher.
    #[serde(default)]
    pub parameter_count: Option<u64>,
    /// Digests that bind the manifest to its inference and attribute payloads.
    checksums: ModelChecksums,
}

/// SHA-256 values declared by `model.json` for the non-manifest assets.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ModelChecksums {
    /// Lowercase or uppercase hexadecimal digest for `model.onnx`.
    model_sha256: String,
    /// Lowercase or uppercase hexadecimal digest for `attribute_directions.json`.
    attribute_directions_sha256: String,
}

/// A validated model directory ready for inference and attribute emphasis.
///
/// Instances come from [`resolve_model`] or [`ensure_model`]. Keeping this
/// value for the lifetime of a job avoids resolving and hashing the same large
/// bundle once per pipeline stage.
#[derive(Debug, Clone)]
pub struct ModelBundle {
    /// Installation directory containing the three required bundle assets.
    pub directory: PathBuf,
    /// Parsed and validated manifest associated with `directory`.
    pub manifest: ModelManifest,
}

/// Release-asset fields needed for sizing, downloading, and verification.
#[derive(Debug, Clone, Deserialize)]
struct GithubReleaseAsset {
    /// Published asset filename; also the filename used inside the bundle.
    name: String,
    /// Direct URL used by the blocking downloader.
    browser_download_url: String,
    /// GitHub-declared byte length used as a strict download bound.
    size: u64,
    /// GitHub-provided digest in `sha256:<hex>` form.
    digest: Option<String>,
}

/// Minimal GitHub Release representation used by the installer.
#[derive(Debug, Clone, Deserialize)]
struct GithubRelease {
    /// Release tag, which must equal the model ID.
    tag_name: String,
    /// Draft releases are never offered or installed.
    #[serde(default)]
    draft: bool,
    /// Prereleases are never offered or installed.
    #[serde(default)]
    prerelease: bool,
    /// Assets whose names, sizes, and digests define the downloadable bundle.
    assets: Vec<GithubReleaseAsset>,
}

/// Parsed attribute-direction file used for semantic bundle validation.
#[derive(Deserialize)]
struct AttributeDirections {
    /// Embedding dimensionality shared by every direction.
    dim: usize,
    /// Direction vectors indexed by the attribute names understood by clustering.
    attributes: HashMap<String, AttributeDirection>,
}

/// One normalized direction in the model's embedding space.
#[derive(Deserialize)]
struct AttributeDirection {
    /// Finite, approximately unit-length vector with `AttributeDirections::dim` values.
    direction: Vec<f32>,
}

/// Returns a completely validated installed model without network access.
///
/// This reads and hashes both payload files, so callers should retain the
/// returned [`ModelBundle`] rather than resolving it again within one job.
/// Invalid IDs, absent installations, malformed metadata, and digest failures
/// are returned as errors.
pub fn resolve_model(model_id: &str) -> Result<ModelBundle> {
    validate_model_id(model_id)?;
    let directory = installed_models_root()?.join(model_id);
    if directory.exists() {
        load_model_bundle(&directory, model_id)
    } else {
        Err(AppError::Processing(format!(
            "Model '{model_id}' is not installed"
        )))
    }
}

/// Ensures `model_id` is usable, downloading its published release when no
/// valid installed copy exists.
///
/// Installation is serialized per model with an advisory file lock. The
/// release manifest is validated before large assets are downloaded, every
/// asset is size-bounded and SHA-256 verified while streaming, and the bundle
/// is assembled under a temporary `.download-*` directory. The completed
/// directory replaces the destination by rename; a previous destination is
/// kept as `.invalid-*` until that rename succeeds so interrupted replacement
/// can be recovered on the next call.
///
/// Emits `model_download_started`, periodic `model_download_progress`, and one
/// terminal completion or failure event when a download is required. Existing
/// valid installations produce no download events.
///
/// This function performs blocking HTTP and filesystem work. Async callers
/// must run its entire lifecycle in a blocking task so the blocking reqwest
/// client is not dropped inside an async runtime.
pub fn ensure_model(model_id: &str, events: &impl EventSink) -> Result<ModelBundle> {
    if let Ok(bundle) = resolve_model(model_id) {
        let invalid_backup = installed_models_root()?.join(format!(".invalid-{model_id}"));
        if invalid_backup.exists() {
            let _ = fs::remove_dir_all(invalid_backup);
        }
        return Ok(bundle);
    }
    validate_model_id(model_id)?;

    let models_root = installed_models_root()?;
    fs::create_dir_all(&models_root)?;
    let locks_root = models_root.join(".locks");
    fs::create_dir_all(&locks_root)?;
    let lock = OpenOptions::new()
        .create(true)
        .truncate(false)
        .read(true)
        .write(true)
        .open(locks_root.join(format!("{model_id}.lock")))?;
    fs4::FileExt::lock(&lock)?;

    remove_stale_downloads(&models_root, model_id)?;
    reconcile_invalid_backup(&models_root, model_id)?;
    if let Ok(bundle) = resolve_model(model_id) {
        return Ok(bundle);
    }

    let client = github_client()?;
    let release = fetch_release(&client, model_id)?;
    if release.draft || release.prerelease || release.tag_name != model_id {
        return Err(AppError::Processing(format!(
            "Model '{model_id}' has no compatible published release"
        )));
    }
    let assets = required_release_assets(&release)?;
    fetch_release_manifest(&client, &release, model_id)?;
    let total_bytes = assets.iter().map(|asset| asset.size).sum::<u64>();
    events.emit_value(
        "model_download_started",
        json!({ "modelId": model_id, "totalBytes": total_bytes }),
    )?;

    let install_result = (|| -> Result<ModelBundle> {
        let staging = tempfile::Builder::new()
            .prefix(&format!(".download-{model_id}_"))
            .tempdir_in(&models_root)?;
        let mut completed_bytes = 0_u64;
        for asset in assets {
            download_asset(
                &client,
                asset,
                &staging.path().join(&asset.name),
                model_id,
                total_bytes,
                &mut completed_bytes,
                events,
            )?;
        }

        let bundle = validate_model_bundle_structure(staging.path(), model_id)?;
        let destination = models_root.join(model_id);
        let invalid_backup = models_root.join(format!(".invalid-{model_id}"));
        if invalid_backup.exists() {
            fs::remove_dir_all(&invalid_backup)?;
        }
        if destination.exists() {
            fs::rename(&destination, &invalid_backup)?;
        }
        let staging_path = staging.keep();
        if let Err(error) = fs::rename(&staging_path, &destination) {
            if invalid_backup.exists() {
                let _ = fs::rename(&invalid_backup, &destination);
            }
            return Err(error.into());
        }
        if invalid_backup.exists() {
            let _ = fs::remove_dir_all(invalid_backup);
        }
        Ok(ModelBundle {
            directory: destination,
            manifest: bundle.manifest,
        })
    })();

    match install_result {
        Ok(bundle) => {
            events.emit_value(
                "model_download_completed",
                json!({ "modelId": model_id, "totalBytes": total_bytes }),
            )?;
            Ok(bundle)
        }
        Err(error) => {
            let _ = events.emit_value(
                "model_download_failed",
                json!({ "modelId": model_id, "error": error.to_string() }),
            );
            Err(error)
        }
    }
}

/// Constructs the blocking GitHub client used by one install operation.
///
/// Request-specific read timeouts are assigned by the individual fetch and
/// download functions; this client supplies the application user agent and a
/// bounded connection-establishment timeout.
fn github_client() -> Result<Client> {
    Client::builder()
        .user_agent(format!("FontCluster/{}", env!("CARGO_PKG_VERSION")))
        .connect_timeout(Duration::from_secs(15))
        .build()
        .map_err(|error| AppError::Network(error.to_string()))
}

/// Fetches the exact release whose tag is `model_id` for installation.
///
/// Compatibility and asset-set checks remain the caller's responsibility.
fn fetch_release(client: &Client, model_id: &str) -> Result<GithubRelease> {
    client
        .get(format!("{MODEL_REPOSITORY_API}/releases/tags/{model_id}"))
        .timeout(Duration::from_secs(30))
        .header("Accept", "application/vnd.github+json")
        .header("X-GitHub-Api-Version", GITHUB_API_VERSION)
        .send()
        .and_then(|response| response.error_for_status())
        .map_err(|error| AppError::Network(error.to_string()))?
        .json()
        .map_err(|error| AppError::Network(error.to_string()))
}

/// Downloads and authenticates the small manifest before any large payload.
///
/// The response is bounded by both [`MAX_MANIFEST_BYTES`] and GitHub's declared
/// asset size. Its GitHub digest is checked before deserialization. The parsed
/// ID/API contract is then validated, and the two payload digests inside the
/// manifest must agree with GitHub's release-asset digests. This establishes a
/// single checksum contract for the later streaming downloads.
fn fetch_release_manifest(
    client: &Client,
    release: &GithubRelease,
    expected_id: &str,
) -> Result<ModelManifest> {
    let asset = release
        .assets
        .iter()
        .find(|asset| asset.name == "model.json")
        .ok_or_else(|| {
            AppError::Processing(format!(
                "Model release '{}' is missing model.json",
                release.tag_name
            ))
        })?;
    if asset.size == 0 || asset.size > MAX_MANIFEST_BYTES {
        return Err(AppError::Processing(format!(
            "Model release '{}' has an invalid model.json size",
            release.tag_name
        )));
    }
    let expected_digest = parse_sha256(asset)?;
    let response = client
        .get(&asset.browser_download_url)
        .timeout(Duration::from_secs(30))
        .send()
        .and_then(|response| response.error_for_status())
        .map_err(|error| AppError::Network(error.to_string()))?;
    let mut bytes = Vec::with_capacity(asset.size as usize);
    response
        .take(asset.size + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| AppError::Network(error.to_string()))?;
    if bytes.len() as u64 != asset.size {
        return Err(AppError::Network(format!(
            "Download of model.json for '{}' ended at {} of {} bytes",
            release.tag_name,
            bytes.len(),
            asset.size
        )));
    }
    if format!("{:x}", Sha256::digest(&bytes)) != expected_digest {
        return Err(AppError::Processing(format!(
            "SHA-256 verification failed for model.json in '{}'",
            release.tag_name
        )));
    }
    let manifest: ModelManifest = serde_json::from_slice(&bytes)?;
    validate_manifest(&manifest, expected_id)?;
    for (asset_name, manifest_digest) in [
        ("model.onnx", &manifest.checksums.model_sha256),
        (
            "attribute_directions.json",
            &manifest.checksums.attribute_directions_sha256,
        ),
    ] {
        let asset = release
            .assets
            .iter()
            .find(|asset| asset.name == asset_name)
            .expect("required release assets were checked before reading model.json");
        if !manifest_digest.eq_ignore_ascii_case(parse_sha256(asset)?) {
            return Err(AppError::Processing(format!(
                "Checksum for {asset_name} in model.json does not match release '{}'",
                release.tag_name
            )));
        }
    }
    Ok(manifest)
}

/// Returns the three assets of a release after validating its exact shape.
///
/// Extra assets are rejected as well as missing ones, and every accepted asset
/// must have a nonzero size and a syntactically valid GitHub SHA-256 digest.
/// The returned order follows [`REQUIRED_ASSETS`] and is therefore stable for
/// progress accounting and installation.
fn required_release_assets(release: &GithubRelease) -> Result<Vec<&GithubReleaseAsset>> {
    if release.assets.len() != REQUIRED_ASSETS.len() {
        return Err(AppError::Processing(format!(
            "Model release '{}' must contain exactly {} assets",
            release.tag_name,
            REQUIRED_ASSETS.len()
        )));
    }
    REQUIRED_ASSETS
        .iter()
        .map(|name| {
            let asset = release
                .assets
                .iter()
                .find(|asset| asset.name == *name)
                .ok_or_else(|| {
                    AppError::Processing(format!(
                        "Model release '{}' is missing {name}",
                        release.tag_name
                    ))
                })?;
            if asset.size == 0 {
                return Err(AppError::Processing(format!(
                    "Model release '{}' has an empty {name}",
                    release.tag_name
                )));
            }
            parse_sha256(asset)?;
            Ok(asset)
        })
        .collect()
}

#[allow(clippy::too_many_arguments)]
/// Streams one release asset into the staging directory while authenticating it.
///
/// At most the GitHub-declared size plus one byte is read, and a response that
/// crosses the declared size is rejected before the excess byte is written.
/// `completed_bytes` is cumulative across bundle assets and is advanced only
/// for bytes written to disk. Progress is emitted in approximately 1 MiB
/// increments. A short response, oversized response, write failure, event
/// failure, or SHA-256 mismatch leaves the error cleanup to the owning temporary
/// directory in [`ensure_model`].
fn download_asset(
    client: &Client,
    asset: &GithubReleaseAsset,
    destination: &Path,
    model_id: &str,
    total_bytes: u64,
    completed_bytes: &mut u64,
    events: &impl EventSink,
) -> Result<()> {
    let expected_digest = parse_sha256(asset)?;
    let response = client
        .get(&asset.browser_download_url)
        .timeout(Duration::from_secs(60 * 60))
        .send()
        .and_then(|response| response.error_for_status())
        .map_err(|error| AppError::Network(error.to_string()))?;
    let mut response = response.take(asset.size.saturating_add(1));
    let mut file = File::create(destination)?;
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    let mut last_reported = *completed_bytes;
    let mut asset_bytes = 0_u64;

    loop {
        let read = response
            .read(&mut buffer)
            .map_err(|error| AppError::Network(error.to_string()))?;
        if read == 0 {
            break;
        }
        let next_asset_bytes = asset_bytes.checked_add(read as u64).ok_or_else(|| {
            AppError::Network(format!(
                "Download of {} exceeded its declared size",
                asset.name
            ))
        })?;
        if next_asset_bytes > asset.size {
            return Err(AppError::Network(format!(
                "Download of {} exceeded its declared size of {} bytes",
                asset.name, asset.size
            )));
        }
        file.write_all(&buffer[..read])?;
        hasher.update(&buffer[..read]);
        asset_bytes = next_asset_bytes;
        *completed_bytes += read as u64;
        if completed_bytes.saturating_sub(last_reported) >= 1024 * 1024 {
            events.emit_value(
                "model_download_progress",
                json!({
                    "modelId": model_id,
                    "downloadedBytes": *completed_bytes,
                    "totalBytes": total_bytes,
                }),
            )?;
            last_reported = *completed_bytes;
        }
    }
    file.sync_all()?;

    if asset_bytes != asset.size {
        return Err(AppError::Network(format!(
            "Download of {} ended at {} of {} bytes",
            asset.name, asset_bytes, asset.size
        )));
    }
    let actual_digest = format!("{:x}", hasher.finalize());
    if actual_digest != expected_digest {
        return Err(AppError::Processing(format!(
            "SHA-256 verification failed for {}",
            asset.name
        )));
    }
    Ok(())
}

/// Extracts a 64-digit hexadecimal SHA-256 value from GitHub's digest field.
///
/// The returned slice borrows the original asset metadata without allocating.
/// Callers decide whether their comparison needs case normalization.
fn parse_sha256(asset: &GithubReleaseAsset) -> Result<&str> {
    let digest = asset
        .digest
        .as_deref()
        .and_then(|digest| digest.strip_prefix("sha256:"))
        .filter(|digest| digest.len() == 64 && digest.bytes().all(|byte| byte.is_ascii_hexdigit()))
        .ok_or_else(|| {
            AppError::Processing(format!(
                "GitHub did not provide a valid SHA-256 digest for {}",
                asset.name
            ))
        })?;
    Ok(digest)
}

/// Loads an installed bundle and fully verifies its payload checksums.
///
/// Structural and semantic validation runs before both payloads are streamed
/// through SHA-256. This is the trust boundary used before model inference or
/// attribute emphasis consumes files from Application Support.
fn load_model_bundle(directory: &Path, expected_id: &str) -> Result<ModelBundle> {
    let bundle = validate_model_bundle_structure(directory, expected_id)?;
    for (path, expected_digest) in [
        (
            bundle.directory.join("model.onnx"),
            &bundle.manifest.checksums.model_sha256,
        ),
        (
            bundle.directory.join("attribute_directions.json"),
            &bundle.manifest.checksums.attribute_directions_sha256,
        ),
    ] {
        let mut source = File::open(&path)?;
        let mut hasher = Sha256::new();
        let mut buffer = [0_u8; 64 * 1024];
        loop {
            let read = source.read(&mut buffer)?;
            if read == 0 {
                break;
            }
            hasher.update(&buffer[..read]);
        }
        if format!("{:x}", hasher.finalize()) != expected_digest.to_ascii_lowercase() {
            return Err(AppError::Processing(format!(
                "SHA-256 verification failed for {}",
                path.display()
            )));
        }
    }
    Ok(bundle)
}

/// Validates bundle shape and attribute semantics without re-hashing payloads.
///
/// This is used immediately after download because [`download_asset`] already
/// authenticated every byte in the same staging directory. It checks manifest
/// compatibility, nonempty payloads, the complete 37-name attribute set, 512
/// dimensions, finite values, and approximately unit-length directions.
fn validate_model_bundle_structure(directory: &Path, expected_id: &str) -> Result<ModelBundle> {
    let manifest: ModelManifest =
        serde_json::from_reader(File::open(directory.join("model.json"))?)?;
    validate_manifest(&manifest, expected_id)?;

    let model_path = directory.join("model.onnx");
    if fs::metadata(&model_path).map_or(true, |metadata| metadata.len() == 0) {
        return Err(AppError::Processing(format!(
            "{} is missing or empty",
            model_path.display()
        )));
    }
    let directions_path = directory.join("attribute_directions.json");
    if fs::metadata(&directions_path).map_or(true, |metadata| metadata.len() == 0) {
        return Err(AppError::Processing(format!(
            "{} is missing or empty",
            directions_path.display()
        )));
    }

    let directions: AttributeDirections = serde_json::from_reader(File::open(&directions_path)?)?;
    if directions.dim != 512
        || directions.attributes.len() != EMPHASIS_ATTRIBUTES.len()
        || EMPHASIS_ATTRIBUTES
            .iter()
            .any(|name| !directions.attributes.contains_key(*name))
    {
        return Err(AppError::Processing(format!(
            "{} must contain all 37 512-dimensional attribute directions",
            directions_path.display()
        )));
    }
    for (name, entry) in directions.attributes {
        let norm_squared = entry
            .direction
            .iter()
            .map(|value| value * value)
            .sum::<f32>();
        if entry.direction.len() != directions.dim
            || entry.direction.iter().any(|value| !value.is_finite())
            || !norm_squared.is_finite()
            || (norm_squared - 1.0).abs() > 0.01
        {
            return Err(AppError::Processing(format!(
                "Attribute direction '{name}' is invalid"
            )));
        }
    }

    Ok(ModelBundle {
        directory: directory.to_path_buf(),
        manifest,
    })
}

/// Enforces the application-facing invariants of `model.json`.
///
/// A compatible manifest has the current API version, exactly the expected ID,
/// a nonempty display name, a positive parameter count when supplied, and two
/// syntactically valid SHA-256 values. This check does not read payload files.
fn validate_manifest(manifest: &ModelManifest, expected_id: &str) -> Result<()> {
    validate_model_id(&manifest.id)?;
    if manifest.model_api_version != MODEL_API_VERSION
        || manifest.id != expected_id
        || manifest.name.trim().is_empty()
        || manifest.parameter_count.is_some_and(|count| count == 0)
    {
        return Err(AppError::Processing(format!(
            "Model '{}' is incompatible with FontCluster model API v{}",
            manifest.id, MODEL_API_VERSION
        )));
    }
    for digest in [
        &manifest.checksums.model_sha256,
        &manifest.checksums.attribute_directions_sha256,
    ] {
        if digest.len() != 64 || !digest.bytes().all(|byte| byte.is_ascii_hexdigit()) {
            return Err(AppError::Processing(format!(
                "Model '{}' has an invalid SHA-256 manifest",
                manifest.id
            )));
        }
    }
    Ok(())
}

/// Validates the identifier grammar used by release tags and filesystem paths.
///
/// Restricting IDs to lowercase ASCII letters, digits, and internal hyphens
/// ensures the ID remains one path segment and keeps staging-prefix matching
/// unambiguous. Empty IDs and leading or trailing hyphens are rejected.
fn validate_model_id(model_id: &str) -> Result<()> {
    let valid = !model_id.is_empty()
        && !model_id.starts_with('-')
        && !model_id.ends_with('-')
        && model_id
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-');
    if valid {
        Ok(())
    } else {
        Err(AppError::Processing(format!(
            "Invalid model ID '{model_id}'"
        )))
    }
}

/// Returns the persistent model root under FontCluster's Application Support directory.
fn installed_models_root() -> Result<PathBuf> {
    Ok(AppState::get_base_dir()?.join("Models"))
}

/// Reconciles the replacement backup left by an interrupted atomic install.
///
/// When the destination is absent, a fully valid `.invalid-*` directory is
/// restored. When both paths exist, the ambiguous backup is removed and the
/// caller continues with validation or a fresh download of the destination.
fn reconcile_invalid_backup(models_root: &Path, model_id: &str) -> Result<()> {
    let destination = models_root.join(model_id);
    let invalid_backup = models_root.join(format!(".invalid-{model_id}"));
    if !invalid_backup.exists() {
        return Ok(());
    }
    if !destination.exists() && load_model_bundle(&invalid_backup, model_id).is_ok() {
        fs::rename(invalid_backup, destination)?;
    } else {
        fs::remove_dir_all(invalid_backup)?;
    }
    Ok(())
}

/// Removes abandoned staging directories for one model while its lock is held.
///
/// The underscore delimiter cannot occur in a valid model ID, so a prefix for
/// `foo` cannot accidentally match a staging directory belonging to `foo-bar`.
fn remove_stale_downloads(models_root: &Path, model_id: &str) -> Result<()> {
    let prefix = format!(".download-{model_id}_");
    for entry in fs::read_dir(models_root)? {
        let path = entry?.path();
        if path
            .file_name()
            .and_then(|name| name.to_str())
            .is_some_and(|name| name.starts_with(&prefix))
        {
            fs::remove_dir_all(path)?;
        }
    }
    Ok(())
}
