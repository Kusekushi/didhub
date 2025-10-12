use didhub_updater::{determine_target_platform, UpdateConfig, UpdateError};
use std::env;
use std::sync::Mutex;

// Some tests in this module mutate process-wide environment variables.
// Cargo runs tests in parallel which can cause races. Guard those tests
// with a global mutex so they run serially.
static TEST_ENV_LOCK: Mutex<()> = Mutex::new(());

#[test]
fn test_determine_target_platform() {
    let platform = determine_target_platform();
    assert!(!platform.is_empty());
    // Should contain OS and architecture
    assert!(platform.len() > 3);
}

#[test]
fn test_update_config_default() {
    let _lock = TEST_ENV_LOCK.lock().unwrap();
    // Clear any existing env vars that might affect the test
    env::remove_var("UPDATE_REPO");
    env::remove_var("UPDATE_CHECK_INTERVAL_HOURS");

    let config = UpdateConfig::default();
    assert_eq!(config.repo_owner, "Kusekushi");
    assert_eq!(config.repo_name, "didhub");
    assert!(config.asset_name_template.contains("{target}"));
    assert!(!config.current_version.is_empty());
    assert!(!config.target_platform.is_empty());
    assert_eq!(config.check_interval_hours, 24);
}

#[test]
fn test_update_config_with_env_vars() {
    let _lock = TEST_ENV_LOCK.lock().unwrap();
    // Clear env vars first
    env::remove_var("UPDATE_REPO");
    env::remove_var("UPDATE_CHECK_INTERVAL_HOURS");

    // Set environment variables
    env::set_var("UPDATE_REPO", "testowner/testrepo");
    env::set_var("UPDATE_CHECK_INTERVAL_HOURS", "12");

    let config = UpdateConfig::default();
    assert_eq!(config.repo_owner, "testowner");
    assert_eq!(config.repo_name, "testrepo");
    assert_eq!(config.check_interval_hours, 12);

    // Clean up
    env::remove_var("UPDATE_REPO");
    env::remove_var("UPDATE_CHECK_INTERVAL_HOURS");
}

#[test]
fn test_update_config_malformed_repo_env() {
    let _lock = TEST_ENV_LOCK.lock().unwrap();
    // Clear env vars first
    env::remove_var("UPDATE_REPO");

    // Set malformed repo env var
    env::set_var("UPDATE_REPO", "malformedrepo");

    let config = UpdateConfig::default();
    assert_eq!(config.repo_owner, "Kusekushi");
    assert_eq!(config.repo_name, "didhub");

    // Clean up
    env::remove_var("UPDATE_REPO");
}

#[test]
fn test_update_config_invalid_interval_env() {
    let _lock = TEST_ENV_LOCK.lock().unwrap();
    // Clear env vars first
    env::remove_var("UPDATE_CHECK_INTERVAL_HOURS");

    // Set invalid interval env var
    env::set_var("UPDATE_CHECK_INTERVAL_HOURS", "notanumber");

    let config = UpdateConfig::default();
    assert_eq!(config.check_interval_hours, 24); // Should use default

    // Clean up
    env::remove_var("UPDATE_CHECK_INTERVAL_HOURS");
}

#[test]
fn test_update_error_display() {
    let error = UpdateError::Disabled;
    assert_eq!(error.to_string(), "Auto-updates are disabled");

    let error = UpdateError::Network("test error".to_string());
    assert_eq!(error.to_string(), "Network error: test error");

    let error = UpdateError::Parse("parse error".to_string());
    assert_eq!(error.to_string(), "Parse error: parse error");

    let error = UpdateError::FileSystem("fs error".to_string());
    assert_eq!(error.to_string(), "File system error: fs error");

    let error = UpdateError::NotAvailable;
    assert_eq!(error.to_string(), "Update not available");
}

#[cfg(not(feature = "updater"))]
#[tokio::test]
async fn test_check_for_updates_disabled() {
    let config = UpdateConfig::default();
    let result = didhub_updater::check_for_updates(&config).await;
    assert!(result.is_err());
    assert!(matches!(result.unwrap_err(), UpdateError::Disabled));
}

#[cfg(not(feature = "updater"))]
#[tokio::test]
async fn test_perform_update_disabled() {
    let config = UpdateConfig::default();
    let result = didhub_updater::perform_update(&config).await;
    assert!(result.is_err());
    assert!(matches!(result.unwrap_err(), UpdateError::Disabled));
}

#[test]
fn test_update_config_asset_name_replacement() {
    let config = UpdateConfig {
        repo_owner: "test".to_string(),
        repo_name: "repo".to_string(),
        asset_name_template: "app-{target}-v1.zip".to_string(),
        current_version: "1.0.0".to_string(),
        target_platform: "linux".to_string(),
        check_interval_hours: 24,
        enabled: true,
    };

    let asset_name = config
        .asset_name_template
        .replace("{target}", &config.target_platform);
    assert_eq!(asset_name, "app-linux-v1.zip");
}

#[test]
fn test_update_config_serialization() {
    let config = UpdateConfig::default();

    // Test serialization
    let serialized = serde_json::to_string(&config).unwrap();
    assert!(serialized.contains("repo_owner"));
    assert!(serialized.contains("repo_name"));
    assert!(serialized.contains("asset_name_template"));

    // Test deserialization
    let deserialized: UpdateConfig = serde_json::from_str(&serialized).unwrap();
    assert_eq!(deserialized.repo_owner, config.repo_owner);
    assert_eq!(deserialized.repo_name, config.repo_name);
    assert_eq!(deserialized.asset_name_template, config.asset_name_template);
}
