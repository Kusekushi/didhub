//! Update subsystem facade for the backend.
//!
//! This crate provides update checking functionality by querying GitHub releases
//! to determine if a newer version is available. Actual update execution is not
//! supported and will return an error.

use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use thiserror::Error;
use tracing::{debug, warn};

/// GitHub repository owner for release checks.
const GITHUB_OWNER: &str = "Kusekushi";
/// GitHub repository name for release checks.
const GITHUB_REPO: &str = "didhub";

/// High-level description of a requested update action.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateAction {
    pub name: String,
    pub metadata: Value,
}

impl UpdateAction {
    pub fn new(name: impl Into<String>, metadata: Value) -> Self {
        Self {
            name: name.into(),
            metadata,
        }
    }
}

/// Response structure for GitHub releases API.
#[derive(Debug, Deserialize)]
struct GitHubRelease {
    tag_name: String,
    #[serde(default)]
    prerelease: bool,
    #[serde(default)]
    draft: bool,
}

/// Public interface for coordinating updates.
#[derive(Debug, Clone)]
pub struct UpdateCoordinator {
    client: Client,
    current_version: String,
}

impl Default for UpdateCoordinator {
    fn default() -> Self {
        Self::new()
    }
}

impl UpdateCoordinator {
    /// Creates a new update coordinator with the current crate version.
    pub fn new() -> Self {
        Self::with_version(env!("CARGO_PKG_VERSION"))
    }

    /// Creates a new update coordinator with a specific current version.
    pub fn with_version(version: impl Into<String>) -> Self {
        Self {
            client: Client::builder()
                .user_agent(concat!("didhub/", env!("CARGO_PKG_VERSION")))
                .build()
                .expect("failed to build HTTP client"),
            current_version: version.into(),
        }
    }

    /// Trigger an update check cycle by querying GitHub releases.
    pub async fn check(&self) -> Result<UpdateStatus, UpdateError> {
        let url = format!(
            "https://api.github.com/repos/{}/{}/releases",
            GITHUB_OWNER, GITHUB_REPO
        );

        debug!("Checking for updates from {}", url);

        let response = self
            .client
            .get(&url)
            .header("Accept", "application/vnd.github+json")
            .header("X-GitHub-Api-Version", "2022-11-28")
            .send()
            .await
            .map_err(|e| {
                warn!("Failed to fetch releases: {}", e);
                UpdateError::Network(e.to_string())
            })?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            warn!("GitHub API returned error: {} - {}", status, body);
            return Err(UpdateError::ApiError {
                status: status.as_u16(),
                message: body,
            });
        }

        let releases: Vec<GitHubRelease> = response.json().await.map_err(|e| {
            warn!("Failed to parse releases response: {}", e);
            UpdateError::ParseError(e.to_string())
        })?;

        // Find the latest non-prerelease, non-draft release
        let latest = releases
            .into_iter()
            .filter(|r| !r.prerelease && !r.draft)
            .next();

        let latest_version = match latest {
            Some(release) => {
                // Strip leading 'v' if present
                release
                    .tag_name
                    .strip_prefix('v')
                    .unwrap_or(&release.tag_name)
                    .to_string()
            }
            None => {
                debug!("No releases found");
                self.current_version.clone()
            }
        };

        let mut pending_actions = Vec::new();

        // Compare versions to determine if an update is available
        if version_is_newer(&latest_version, &self.current_version) {
            pending_actions.push(UpdateAction::new(
                "update_available",
                serde_json::json!({
                    "current_version": self.current_version,
                    "latest_version": latest_version,
                }),
            ));
        }

        Ok(UpdateStatus {
            latest_version,
            current_version: self.current_version.clone(),
            pending_actions,
        })
    }

    /// Execute the supplied action.
    ///
    /// **Note**: Automatic updates are not supported. This method always returns
    /// an error indicating that manual update is required.
    pub async fn execute(&self, action: UpdateAction) -> Result<(), UpdateError> {
        Err(UpdateError::NotSupported(format!(
            "Automatic execution of update action '{}' is not supported. \
             Please update manually by downloading the latest release from \
             https://github.com/{}/{}/releases",
            action.name, GITHUB_OWNER, GITHUB_REPO
        )))
    }
}

/// Simple semver comparison. Returns true if `latest` is newer than `current`.
fn version_is_newer(latest: &str, current: &str) -> bool {
    let parse = |v: &str| -> Option<(u32, u32, u32)> {
        let parts: Vec<&str> = v.split('.').collect();
        if parts.len() >= 3 {
            Some((
                parts[0].parse().ok()?,
                parts[1].parse().ok()?,
                parts[2].split('-').next()?.parse().ok()?,
            ))
        } else if parts.len() == 2 {
            Some((parts[0].parse().ok()?, parts[1].parse().ok()?, 0))
        } else if parts.len() == 1 {
            Some((parts[0].parse().ok()?, 0, 0))
        } else {
            None
        }
    };

    match (parse(latest), parse(current)) {
        (Some(l), Some(c)) => l > c,
        _ => false,
    }
}

/// Describes the state returned from an update check.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateStatus {
    pub latest_version: String,
    pub current_version: String,
    pub pending_actions: Vec<UpdateAction>,
}

impl UpdateStatus {
    /// Returns true if an update is available.
    pub fn update_available(&self) -> bool {
        !self.pending_actions.is_empty()
    }
}

/// Update subsystem specific error states.
#[derive(Debug, Error)]
pub enum UpdateError {
    #[error("update subsystem is unavailable")]
    Unavailable,
    #[error("failed to execute update: {0}")]
    Execution(String),
    #[error("network error: {0}")]
    Network(String),
    #[error("GitHub API error (status {status}): {message}")]
    ApiError { status: u16, message: String },
    #[error("failed to parse response: {0}")]
    ParseError(String),
    #[error("operation not supported: {0}")]
    NotSupported(String),
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_version_comparison() {
        assert!(version_is_newer("1.0.0", "0.9.0"));
        assert!(version_is_newer("1.1.0", "1.0.0"));
        assert!(version_is_newer("1.0.1", "1.0.0"));
        assert!(version_is_newer("2.0.0", "1.9.9"));

        assert!(!version_is_newer("1.0.0", "1.0.0"));
        assert!(!version_is_newer("0.9.0", "1.0.0"));
        assert!(!version_is_newer("1.0.0", "1.0.1"));
    }

    #[test]
    fn test_version_with_prerelease() {
        // Prerelease suffix should be stripped for comparison
        assert!(version_is_newer("1.0.1", "1.0.0-beta"));
        assert!(version_is_newer("1.0.0", "0.9.0-rc1"));
    }
}
