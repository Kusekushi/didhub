#[cfg(feature = "updater")]
use self_update;
#[cfg(feature = "updater")]
use tracing::{debug, error, info, warn};

include!(concat!(env!("OUT_DIR"), "/versions.rs"));

#[derive(Debug, serde::Serialize, serde::Deserialize)]
pub struct UpdateConfig {
    pub repo_owner: String,
    pub repo_name: String,
    pub asset_name_template: String, // e.g. "didhub-server-{target}"
    pub current_version: String,
    pub target_platform: String,
    pub check_interval_hours: u64,
    pub enabled: bool,
}

impl Default for UpdateConfig {
    fn default() -> Self {
        // Parse repo from config format "owner/repo"
        let repo_str =
            std::env::var("UPDATE_REPO").unwrap_or_else(|_| "Kusekushi/didhub".to_string());
        let (owner, name) = if let Some((o, n)) = repo_str.split_once('/') {
            (o.to_string(), n.to_string())
        } else {
            ("Kusekushi".to_string(), "didhub".to_string())
        };

        let check_interval = std::env::var("UPDATE_CHECK_INTERVAL_HOURS")
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or(24);

        // Allow disabling updates entirely
        let enabled = std::env::var("UPDATE_ENABLED")
            .map(|s| s.to_lowercase() == "true" || s == "1")
            .unwrap_or(true);

        Self {
            repo_owner: owner,
            repo_name: name,
            asset_name_template: "didhub-release-{target}.zip".to_string(),
            current_version: env!("CARGO_PKG_VERSION").to_string(),
            target_platform: determine_target_platform(),
            check_interval_hours: check_interval,
            enabled,
        }
    }
}

#[derive(Debug, serde::Serialize)]
pub struct UpdateStatus {
    pub available: bool,
    pub current_version: String,
    pub latest_version: Option<String>,
    pub download_url: Option<String>,
    pub message: String,
    pub versions: VersionInfo,
}

#[derive(Debug, serde::Serialize)]
pub struct VersionInfo {
    pub server: String,
    pub db: String,
    pub auth: String,
    pub cache: String,
    pub error: String,
    pub config: String,
    pub oidc: String,
    pub metrics: String,
    pub housekeeping: String,
    pub middleware: String,
    pub updater: String,
    pub migrations: String,
    pub frontend: String,
}

pub fn get_version_info() -> VersionInfo {
    VersionInfo {
        server: SERVER_VERSION.to_string(),
        db: DB_VERSION.to_string(),
        auth: AUTH_VERSION.to_string(),
        cache: CACHE_VERSION.to_string(),
        error: ERROR_VERSION.to_string(),
        config: CONFIG_VERSION.to_string(),
        oidc: OIDC_VERSION.to_string(),
        metrics: METRICS_VERSION.to_string(),
        housekeeping: HOUSEKEEPING_VERSION.to_string(),
        middleware: MIDDLEWARE_VERSION.to_string(),
        updater: UPDATER_VERSION.to_string(),
        migrations: MIGRATIONS_VERSION.to_string(),
        frontend: FRONTEND_VERSION.to_string(),
    }
}

#[derive(Debug, serde::Serialize)]
pub struct UpdateResult {
    pub success: bool,
    pub message: String,
    pub version_updated: Option<String>,
    pub restart_needed: bool,
}

#[derive(Debug, thiserror::Error)]
pub enum UpdateError {
    #[error("Auto-updates are disabled")]
    Disabled,
    #[error("Network error: {0}")]
    Network(String),
    #[error("Parse error: {0}")]
    Parse(String),
    #[error("File system error: {0}")]
    FileSystem(String),
    #[error("Update not available")]
    NotAvailable,
    #[cfg(feature = "updater")]
    #[error("Self-update error: {0}")]
    SelfUpdate(#[from] self_update::errors::Error),
}

/// Check if updates are available without downloading
#[cfg(feature = "updater")]
pub async fn check_for_updates(config: &UpdateConfig) -> Result<UpdateStatus, UpdateError> {
    if !config.enabled {
        debug!("updates are disabled via configuration");
        return Ok(UpdateStatus {
            available: false,
            current_version: config.current_version.clone(),
            latest_version: None,
            download_url: None,
            message: "Updates are disabled".to_string(),
            versions: get_version_info(),
        });
    }

    info!(
        repo = format!("{}/{}", config.repo_owner, config.repo_name),
        current_version = config.current_version,
        target_platform = config.target_platform,
        "checking for software updates"
    );

    let releases = tokio::task::spawn_blocking({
        let repo_owner = config.repo_owner.clone();
        let repo_name = config.repo_name.clone();
        move || {
            self_update::backends::github::ReleaseList::configure()
                .repo_owner(&repo_owner)
                .repo_name(&repo_name)
                .build()
                .and_then(|release_list| release_list.fetch())
        }
    })
    .await
    .map_err(|e| UpdateError::Network(format!("Task join error: {}", e)))?
    .map_err(|e| UpdateError::SelfUpdate(e))?;

    if releases.is_empty() {
        debug!("no releases found in repository");
        return Ok(UpdateStatus {
            available: false,
            current_version: config.current_version.clone(),
            latest_version: None,
            download_url: None,
            message: "No releases found".to_string(),
            versions: get_version_info(),
        });
    }

    let latest_release = &releases[0];
    let latest_version = latest_release.version.clone();

    // Check if this might be a draft release by examining the name/version
    let is_likely_draft = latest_release.name.to_lowercase().contains("draft")
        || latest_release.version.to_lowercase().contains("draft")
        || latest_release
            .body
            .as_ref()
            .map(|b| b.to_lowercase().contains("draft"))
            .unwrap_or(false);

    if is_likely_draft {
        warn!(
            release_name=%latest_release.name,
            release_version=%latest_version,
            "skipping likely draft release"
        );
        return Ok(UpdateStatus {
            available: false,
            current_version: config.current_version.clone(),
            latest_version: Some(latest_version),
            download_url: None,
            message: "Latest release appears to be a draft".to_string(),
            versions: get_version_info(),
        });
    }

    debug!(
        latest_version=%latest_version,
        release_count=%releases.len(),
        asset_count=%latest_release.assets.len(),
        release_name=%latest_release.name,
        "found latest release"
    );

    // Simple version comparison - in production you might want to use semver crate
    let available = latest_version != config.current_version;

    if !available {
        info!(current_version=%config.current_version, "software is already up to date");
        return Ok(UpdateStatus {
            available: false,
            current_version: config.current_version.clone(),
            latest_version: Some(latest_version),
            download_url: None,
            message: "Already up to date".to_string(),
            versions: get_version_info(),
        });
    }

    // Look for the appropriate asset for our platform
    let asset_name = config
        .asset_name_template
        .replace("{target}", &config.target_platform);

    debug!(
        asset_name=%asset_name,
        target_platform=%config.target_platform,
        asset_template=%config.asset_name_template,
        "looking for compatible release asset"
    );

    // Check if the asset exists, but construct the download URL manually
    // instead of using the API URL from asset.download_url
    let asset_exists = latest_release.asset_for(&asset_name, None).is_some();

    let download_url = if asset_exists {
        // Construct the proper GitHub download URL
        let url = format!(
            "https://github.com/{}/{}/releases/download/v{}/{}",
            config.repo_owner, config.repo_name, latest_release.version, asset_name
        );
        debug!(download_url=%url, "constructed GitHub download URL");
        Some(url)
    } else {
        None
    };

    if download_url.is_some() {
        info!(
            current_version=%config.current_version,
            latest_version=%latest_version,
            asset_name=%asset_name,
            "update available with compatible asset"
        );
    } else {
        // Log available assets for debugging
        let available_assets: Vec<String> = latest_release
            .assets
            .iter()
            .map(|asset| asset.name.clone())
            .collect();
        warn!(
            latest_version=%latest_version,
            asset_name=%asset_name,
            available_assets=?available_assets,
            "update available but no compatible asset found"
        );
    }

    Ok(UpdateStatus {
        available,
        current_version: config.current_version.clone(),
        latest_version: Some(latest_version.clone()),
        download_url: download_url.clone(),
        message: if download_url.is_some() {
            format!(
                "Update available: {} -> {}",
                config.current_version, latest_version
            )
        } else {
            format!(
                "Update {} available but no asset found for {}",
                latest_version, asset_name
            )
        },
        versions: get_version_info(),
    })
}

/// Perform the actual update
#[cfg(feature = "updater")]
pub async fn perform_update(config: &UpdateConfig) -> Result<UpdateResult, UpdateError> {
    if !config.enabled {
        debug!("updates are disabled via configuration");
        return Ok(UpdateResult {
            success: false,
            message: "Updates are disabled".to_string(),
            version_updated: None,
            restart_needed: false,
        });
    }

    info!(
        current_version=%config.current_version,
        target_platform=%config.target_platform,
        "starting software update process"
    );

    let status = check_for_updates(config).await?;

    if !status.available {
        debug!("no update available, aborting update process");
        return Ok(UpdateResult {
            success: false,
            message: status.message,
            version_updated: None,
            restart_needed: false,
        });
    }

    let asset_name = config
        .asset_name_template
        .replace("{target}", &config.target_platform);

    // Determine the binary name inside the zip
    let bin_name = if config.target_platform == "windows" {
        "didhub-server.exe"
    } else {
        "didhub-server"
    };

    info!(asset_name=%asset_name, bin_name=%bin_name, "downloading and applying update");

    // Get the download URL
    let status = check_for_updates(config).await?;
    let download_url = status.download_url.ok_or_else(|| {
        error!(
            asset_name=%asset_name,
            repo=format!("{}/{}", config.repo_owner, config.repo_name),
            "No compatible release asset found for platform"
        );
        UpdateError::NotAvailable
    })?;
    let latest_version = status
        .latest_version
        .ok_or_else(|| UpdateError::NotAvailable)?;

    info!(download_url=%download_url, "attempting to download update");

    // Pre-flight check: validate the download URL is accessible
    let client = reqwest::Client::new();
    let head_response = client
        .head(&download_url)
        .send()
        .await
        .map_err(|e| UpdateError::Network(format!("HEAD request failed: {}", e)))?;

    if !head_response.status().is_success() {
        error!(
            status=%head_response.status(),
            url=%download_url,
            "Asset download URL is not accessible (HEAD request failed)"
        );

        // Provide specific guidance for 403 Forbidden
        if head_response.status() == reqwest::StatusCode::FORBIDDEN {
            return Err(UpdateError::Network(
                "Asset download forbidden. This usually means:\n\
                 • The release is a draft (not published)\n\
                 • The repository is private\n\
                 • The asset requires authentication\n\
                 • Check GitHub repository settings and ensure the release is published\n\
                 • Verify the repository is public if updates should be available to all users"
                    .to_string(),
            ));
        } else {
            return Err(UpdateError::Network(format!(
                "Asset not accessible: {}",
                head_response.status()
            )));
        }
    }

    info!("asset URL validated, proceeding with download");

    // Download and extract the update manually
    let response = client
        .get(&download_url)
        .send()
        .await
        .map_err(|e| UpdateError::Network(format!("Download request failed: {}", e)))?;

    if !response.status().is_success() {
        error!(
            status=%response.status(),
            url=%download_url,
            "Download request returned error status"
        );

        // If we get a 403 Forbidden, provide additional diagnostic information
        if response.status() == reqwest::StatusCode::FORBIDDEN {
            // Try to fetch release information again to list available assets
            let releases = tokio::task::spawn_blocking({
                let repo_owner = config.repo_owner.clone();
                let repo_name = config.repo_name.clone();
                move || {
                    self_update::backends::github::ReleaseList::configure()
                        .repo_owner(&repo_owner)
                        .repo_name(&repo_name)
                        .build()
                        .and_then(|release_list| release_list.fetch())
                }
            })
            .await
            .map_err(|e| {
                UpdateError::Network(format!("Task join error during diagnostics: {}", e))
            })?
            .map_err(|e| UpdateError::SelfUpdate(e))?;

            if let Some(latest_release) = releases.first() {
                let available_assets: Vec<String> = latest_release
                    .assets
                    .iter()
                    .map(|asset| asset.name.clone())
                    .collect();

                error!(
                    expected_asset=%asset_name,
                    available_assets=?available_assets,
                    release_version=%latest_release.version,
                    "403 Forbidden: Asset not accessible. Check if release is draft/pre-release or repository is private"
                );
            }
        }

        return Err(UpdateError::Network(format!(
            "Download failed with status: {}",
            response.status()
        )));
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|e| UpdateError::Network(format!("Failed to read response: {}", e)))?;

    // Get current executable directory
    let current_exe = std::env::current_exe().map_err(|e| {
        UpdateError::FileSystem(format!("Failed to get current executable path: {}", e))
    })?;
    let install_dir = current_exe.parent().ok_or_else(|| {
        UpdateError::FileSystem("Cannot determine installation directory".to_string())
    })?;

    // Create a backup directory in temp
    let backup_dir = std::env::temp_dir().join("didhub-backup");
    if backup_dir.exists() {
        std::fs::remove_dir_all(&backup_dir)
            .map_err(|e| UpdateError::FileSystem(format!("Failed to remove old backup: {}", e)))?;
    }
    std::fs::create_dir(&backup_dir).map_err(|e| {
        UpdateError::FileSystem(format!("Failed to create backup directory: {}", e))
    })?;

    // Backup current files
    let files_to_backup = [
        "didhub-server",
        "didhub-server.exe",
        "config.example.json",
        "RUN.md",
        "VERSION",
    ];
    for file in &files_to_backup {
        let file_path = install_dir.join(file);
        if file_path.exists() {
            let backup_path = backup_dir.join(file);
            std::fs::copy(&file_path, &backup_path).map_err(|e| {
                UpdateError::FileSystem(format!("Failed to backup {}: {}", file, e))
            })?;
        }
    }

    // Extract zip
    let cursor = std::io::Cursor::new(bytes);
    let mut archive = zip::ZipArchive::new(cursor)
        .map_err(|e| UpdateError::Parse(format!("Failed to open zip: {}", e)))?;

    for i in 0..archive.len() {
        let mut file = archive
            .by_index(i)
            .map_err(|e| UpdateError::Parse(format!("Failed to read zip entry: {}", e)))?;

        let outpath = install_dir.join(file.name());

        if file.name().ends_with('/') {
            std::fs::create_dir_all(&outpath).map_err(|e| {
                UpdateError::FileSystem(format!("Failed to create directory: {}", e))
            })?;
        } else {
            if let Some(p) = outpath.parent() {
                if !p.exists() {
                    std::fs::create_dir_all(p).map_err(|e| {
                        UpdateError::FileSystem(format!("Failed to create directory: {}", e))
                    })?;
                }
            }
            let mut outfile = std::fs::File::create(&outpath)
                .map_err(|e| UpdateError::FileSystem(format!("Failed to create file: {}", e)))?;
            std::io::copy(&mut file, &mut outfile)
                .map_err(|e| UpdateError::FileSystem(format!("Failed to write file: {}", e)))?;
        }
    }

    // Verify the update
    let version_file = install_dir.join("VERSION");
    let new_version = if version_file.exists() {
        std::fs::read_to_string(&version_file)
            .map_err(|e| UpdateError::FileSystem(format!("Failed to read VERSION file: {}", e)))?
            .trim()
            .to_string()
    } else {
        latest_version.clone()
    };

    info!(new_version=%new_version, "update completed successfully");

    Ok(UpdateResult {
        success: true,
        message: format!("Successfully updated to version {}", new_version),
        version_updated: Some(new_version),
        restart_needed: true,
    })
}

#[cfg(not(feature = "updater"))]
pub async fn check_for_updates(config: &UpdateConfig) -> Result<UpdateStatus, UpdateError> {
    if !config.enabled {
        return Ok(UpdateStatus {
            available: false,
            current_version: config.current_version.clone(),
            latest_version: None,
            download_url: None,
            message: "Updates are disabled".to_string(),
            versions: get_version_info(),
        });
    }
    Err(UpdateError::Disabled)
}

#[cfg(not(feature = "updater"))]
pub async fn perform_update(config: &UpdateConfig) -> Result<UpdateResult, UpdateError> {
    if !config.enabled {
        return Ok(UpdateResult {
            success: false,
            message: "Updates are disabled".to_string(),
            version_updated: None,
            restart_needed: false,
        });
    }
    Err(UpdateError::Disabled)
}

/// Determine the target platform string for asset naming
pub fn determine_target_platform() -> String {
    let os = std::env::consts::OS;

    match os {
        "windows" => "windows".to_string(),
        "linux" => "linux".to_string(),
        _ => os.to_string(),
    }
}
