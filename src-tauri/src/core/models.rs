//! Model catalog, resolution, and persistent installation.
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
use std::collections::{BTreeMap, HashMap};
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::time::Duration;

const MODEL_REPOSITORY_API: &str = "https://api.github.com/repos/MugiSus/fontcluster-models";
const GITHUB_API_VERSION: &str = "2026-03-10";
const MODEL_API_VERSION: u32 = 1;
const MAX_MANIFEST_BYTES: u64 = 64 * 1024;
const REQUIRED_ASSETS: [&str; 3] = ["model.json", "model.onnx", "attribute_directions.json"];
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

/// Public metadata stored beside every model and published as a release asset.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelManifest {
    pub model_api_version: u32,
    pub id: String,
    pub name: String,
    pub description: String,
    #[serde(default)]
    pub parameter_count: Option<u64>,
    #[serde(alias = "provenance")]
    checksums: ModelChecksums,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ModelChecksums {
    model_sha256: String,
    attribute_directions_sha256: String,
}

/// A validated model directory ready for inference and attribute emphasis.
#[derive(Debug, Clone)]
pub struct ModelBundle {
    pub directory: PathBuf,
    pub manifest: ModelManifest,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ModelAvailability {
    Available,
    NotDownloaded,
}

/// Minimal catalog projection consumed by the algorithm-options dropdown.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelCatalogEntry {
    pub id: String,
    pub name: String,
    pub description: String,
    pub parameter_count: Option<u64>,
    pub download_size: u64,
    pub availability: ModelAvailability,
}

/// Catalog lookup remains useful offline: installed entries are returned
/// even when GitHub cannot be reached, with the failure carried as a warning.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelCatalogResponse {
    pub models: Vec<ModelCatalogEntry>,
    pub warning: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct GithubReleaseAsset {
    name: String,
    browser_download_url: String,
    size: u64,
    digest: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct GithubRelease {
    tag_name: String,
    name: Option<String>,
    body: Option<String>,
    #[serde(default)]
    draft: bool,
    #[serde(default)]
    prerelease: bool,
    assets: Vec<GithubReleaseAsset>,
}

#[derive(Deserialize)]
struct AttributeDirections {
    dim: usize,
    attributes: HashMap<String, AttributeDirection>,
}

#[derive(Deserialize)]
struct AttributeDirection {
    direction: Vec<f32>,
}

/// Fetches published releases and merges them with models installed in
/// Application Support.
pub fn list_models() -> ModelCatalogResponse {
    let mut entries = BTreeMap::new();
    for bundle in discover_local_models() {
        entries.insert(
            bundle.manifest.id.clone(),
            ModelCatalogEntry {
                id: bundle.manifest.id.clone(),
                name: bundle.manifest.name,
                description: bundle.manifest.description,
                parameter_count: bundle.manifest.parameter_count,
                download_size: 0,
                availability: ModelAvailability::Available,
            },
        );
    }

    let warning = match github_client().and_then(|client| {
        let releases = fetch_releases(&client)?;
        Ok((client, releases))
    }) {
        Ok((client, releases)) => {
            let mut warnings = Vec::new();
            for release in releases
                .into_iter()
                .filter(|release| !release.draft && !release.prerelease)
            {
                let model_id = release.tag_name.clone();
                if validate_model_id(&model_id).is_err()
                    || required_release_assets(&release).is_err()
                {
                    continue;
                }
                if entries.contains_key(&model_id) {
                    continue;
                }
                let manifest = match fetch_release_manifest(&client, &release, &model_id) {
                    Ok(manifest) => Some(manifest),
                    Err(error @ AppError::Network(_)) => {
                        warnings.push(format!("Could not read metadata for '{model_id}': {error}"));
                        None
                    }
                    Err(error) => {
                        warnings.push(format!("Ignoring model release '{model_id}': {error}"));
                        continue;
                    }
                };
                let download_size = release
                    .assets
                    .iter()
                    .filter(|asset| REQUIRED_ASSETS.contains(&asset.name.as_str()))
                    .map(|asset| asset.size)
                    .sum();
                let (name, description, parameter_count) = match manifest {
                    Some(manifest) => (
                        manifest.name,
                        manifest.description,
                        manifest.parameter_count,
                    ),
                    None => (
                        release.name.unwrap_or_else(|| model_id.clone()),
                        release
                            .body
                            .as_deref()
                            .and_then(|body| body.lines().find(|line| !line.trim().is_empty()))
                            .unwrap_or("")
                            .trim()
                            .to_string(),
                        None,
                    ),
                };
                entries
                    .entry(model_id.clone())
                    .or_insert(ModelCatalogEntry {
                        id: model_id.clone(),
                        name,
                        description,
                        parameter_count,
                        download_size,
                        availability: ModelAvailability::NotDownloaded,
                    });
            }
            (!warnings.is_empty()).then(|| warnings.join("; "))
        }
        Err(error) => Some(error.to_string()),
    };

    ModelCatalogResponse {
        models: entries.into_values().collect(),
        warning,
    }
}

/// Returns a validated installed model without performing network access.
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
pub fn ensure_model(model_id: &str, events: &impl EventSink) -> Result<ModelBundle> {
    if let Ok(bundle) = resolve_model(model_id) {
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

    if let Ok(bundle) = resolve_model(model_id) {
        return Ok(bundle);
    }
    remove_stale_downloads(&models_root, model_id)?;

    let client = github_client()?;
    let release = fetch_release(&client, model_id)?;
    if release.draft || release.prerelease || release.tag_name != model_id {
        return Err(AppError::Processing(format!(
            "Model '{model_id}' has no compatible published release"
        )));
    }
    let assets = required_release_assets(&release)?;
    let total_bytes = assets.iter().map(|asset| asset.size).sum::<u64>();
    events.emit_value(
        "model_download_started",
        json!({ "modelId": model_id, "totalBytes": total_bytes }),
    )?;

    let install_result = (|| -> Result<ModelBundle> {
        let staging = tempfile::Builder::new()
            .prefix(&format!(".download-{model_id}-"))
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

        let bundle = load_model_bundle(staging.path(), model_id)?;
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

fn github_client() -> Result<Client> {
    Client::builder()
        .user_agent(format!("FontCluster/{}", env!("CARGO_PKG_VERSION")))
        .connect_timeout(Duration::from_secs(15))
        .build()
        .map_err(|error| AppError::Network(error.to_string()))
}

fn fetch_releases(client: &Client) -> Result<Vec<GithubRelease>> {
    client
        .get(format!("{MODEL_REPOSITORY_API}/releases?per_page=100"))
        .timeout(Duration::from_secs(30))
        .header("Accept", "application/vnd.github+json")
        .header("X-GitHub-Api-Version", GITHUB_API_VERSION)
        .send()
        .and_then(|response| response.error_for_status())
        .map_err(|error| AppError::Network(error.to_string()))?
        .json()
        .map_err(|error| AppError::Network(error.to_string()))
}

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
        .take(MAX_MANIFEST_BYTES + 1)
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
            parse_sha256(asset)?;
            Ok(asset)
        })
        .collect()
}

#[allow(clippy::too_many_arguments)]
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
    let mut response = client
        .get(&asset.browser_download_url)
        .timeout(Duration::from_secs(60 * 60))
        .send()
        .and_then(|response| response.error_for_status())
        .map_err(|error| AppError::Network(error.to_string()))?;
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
        file.write_all(&buffer[..read])?;
        hasher.update(&buffer[..read]);
        asset_bytes += read as u64;
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

fn load_model_bundle(directory: &Path, expected_id: &str) -> Result<ModelBundle> {
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
    for (path, expected_digest) in [
        (&model_path, &manifest.checksums.model_sha256),
        (
            &directions_path,
            &manifest.checksums.attribute_directions_sha256,
        ),
    ] {
        if expected_digest.len() != 64
            || !expected_digest.bytes().all(|byte| byte.is_ascii_hexdigit())
        {
            return Err(AppError::Processing(format!(
                "Model '{}' has an invalid SHA-256 manifest",
                manifest.id
            )));
        }
        let mut source = File::open(path)?;
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
    Ok(())
}

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

fn installed_models_root() -> Result<PathBuf> {
    Ok(AppState::get_base_dir()?.join("Models"))
}

fn discover_local_models() -> Vec<ModelBundle> {
    let Ok(models_root) = installed_models_root() else {
        return Vec::new();
    };
    let Ok(entries) = fs::read_dir(models_root) else {
        return Vec::new();
    };
    let mut bundles = Vec::new();
    for entry in entries.flatten() {
        let directory = entry.path();
        let Some(id) = directory.file_name().and_then(|name| name.to_str()) else {
            continue;
        };
        if validate_model_id(id).is_err() {
            continue;
        }
        if let Ok(bundle) = load_model_bundle(&directory, id) {
            bundles.push(bundle);
        }
    }
    bundles
}

fn remove_stale_downloads(models_root: &Path, model_id: &str) -> Result<()> {
    let prefix = format!(".download-{model_id}-");
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn manifest_accepts_current_checksums_and_cached_provenance() {
        let checksum = "a".repeat(64);
        let current: ModelManifest = serde_json::from_value(json!({
            "modelApiVersion": 1,
            "id": "fontclip-vit-b32-v1",
            "name": "FontCLIP ViT-B/32",
            "description": "Model",
            "parameterCount": 87_849_216,
            "checksums": {
                "modelSha256": checksum,
                "attributeDirectionsSha256": checksum,
            },
        }))
        .unwrap();
        assert_eq!(current.parameter_count, Some(87_849_216));
        assert!(validate_manifest(&current, "fontclip-vit-b32-v1").is_ok());

        let cached: ModelManifest = serde_json::from_value(json!({
            "schemaVersion": 1,
            "modelApiVersion": 1,
            "id": "fontclip-vit-b32-v1",
            "name": "FontCLIP ViT-B/32",
            "description": "Model",
            "inference": {},
            "provenance": {
                "modelSha256": checksum,
                "attributeDirectionsSha256": checksum,
            },
        }))
        .unwrap();
        assert_eq!(cached.parameter_count, None);
        assert!(validate_manifest(&cached, "fontclip-vit-b32-v1").is_ok());
    }

    #[test]
    fn model_ids_are_safe_directory_names() {
        assert!(validate_model_id("fontclip-vit-b32-v1").is_ok());
        for invalid in ["", "../model", "Model", "-model", "model-", "model_v2"] {
            assert!(validate_model_id(invalid).is_err(), "accepted {invalid}");
        }
    }

    #[test]
    fn github_digest_must_be_sha256() {
        let asset = GithubReleaseAsset {
            name: "model.onnx".into(),
            browser_download_url: String::new(),
            size: 1,
            digest: Some(format!("sha256:{}", "a".repeat(64))),
        };
        assert_eq!(parse_sha256(&asset).unwrap(), "a".repeat(64));

        for invalid in [
            None,
            Some(format!("md5:{}", "a".repeat(32))),
            Some(format!("sha256:{}", "a".repeat(63))),
            Some(format!("sha256:{}z", "a".repeat(63))),
        ] {
            let asset = GithubReleaseAsset {
                name: "model.onnx".into(),
                browser_download_url: String::new(),
                size: 1,
                digest: invalid,
            };
            assert!(parse_sha256(&asset).is_err());
        }
    }

    #[test]
    fn model_release_has_exactly_the_required_assets() {
        let assets = REQUIRED_ASSETS
            .iter()
            .map(|name| GithubReleaseAsset {
                name: name.to_string(),
                browser_download_url: String::new(),
                size: 1,
                digest: Some(format!("sha256:{}", "a".repeat(64))),
            })
            .collect::<Vec<_>>();
        let release = GithubRelease {
            tag_name: "fontclip-vit-b32-v1".into(),
            name: None,
            body: None,
            draft: false,
            prerelease: false,
            assets: assets.clone(),
        };
        assert!(required_release_assets(&release).is_ok());

        let mut unexpected = release;
        unexpected.assets.push(GithubReleaseAsset {
            name: "README.md".into(),
            browser_download_url: String::new(),
            size: 1,
            digest: Some(format!("sha256:{}", "a".repeat(64))),
        });
        assert!(required_release_assets(&unexpected).is_err());
    }
}
