use didhub_config::AppConfig;
use serde_json::json;
use std::env;
use std::sync::{Mutex, OnceLock};

static ENV_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

fn env_guard() -> std::sync::MutexGuard<'static, ()> {
    ENV_LOCK.get_or_init(|| Mutex::new(())).lock().unwrap()
}

fn reset_env() {
    for key in [
        "ALLOW_ALL_FRONTEND_ORIGINS",
        "LOG_FORMAT",
        "LOG_LEVEL",
        "RUST_LOG",
        "UPLOAD_DIR",
        "DIDHUB_DB",
        "DIDHUB_DB_CONFIG",
        "DIDHUB_CONFIG_FILE",
        "FRONTEND_BASE_URL",
    ] {
        env::remove_var(key);
    }
}

#[test]
fn parse_comma_separated_origins() {
    let _guard = env_guard();
    reset_env();
    env::set_var(
        "FRONTEND_BASE_URL",
        "http://a.example.com, http://b.example.com",
    );
    let cfg = AppConfig::from_env().unwrap();
    assert!(cfg.frontend_origins.len() >= 2);
}

#[test]
fn parse_json_array_origins() {
    let _guard = env_guard();
    reset_env();
    env::set_var(
        "FRONTEND_BASE_URL",
        r#"["http://x.local","http://y.local/"]"#,
    );
    let cfg = AppConfig::from_env().unwrap();
    assert_eq!(cfg.frontend_origins.len(), 2);
}

#[test]
fn config_file_upload_directory_overrides_default() {
    let _guard = env_guard();
    reset_env();
    env::set_var("FRONTEND_BASE_URL", "http://localhost:5173");

    let unique = format!(
        "didhub-config-test-{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    );
    let base_dir = std::env::temp_dir().join(unique);
    std::fs::create_dir_all(&base_dir).unwrap();
    let config_path = base_dir.join("config.json");
    let uploads_dir = base_dir.join("custom_uploads");

    let config_contents = json!({
        "database": {
            "driver": "sqlite",
            "path": "./data/didhub.sqlite"
        },
        "uploads": {
            "directory": uploads_dir.to_string_lossy()
        }
    });
    std::fs::write(
        &config_path,
        serde_json::to_string_pretty(&config_contents).unwrap(),
    )
    .unwrap();

    env::set_var("DIDHUB_CONFIG_FILE", &config_path);
    let cfg = AppConfig::from_env().unwrap();
    let expected = uploads_dir.to_string_lossy().replace('\\', "/");
    assert_eq!(cfg.upload_dir.replace('\\', "/"), expected);

    env::remove_var("DIDHUB_CONFIG_FILE");
}

#[test]
fn config_file_logging_flags() {
    let _guard = env_guard();
    reset_env();
    env::set_var("FRONTEND_BASE_URL", "http://localhost:5173");

    let unique = format!(
        "didhub-config-test-log-{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    );
    let base_dir = std::env::temp_dir().join(unique);
    std::fs::create_dir_all(&base_dir).unwrap();
    let config_path = base_dir.join("config.json");

    let config_contents = json!({
        "database": {
            "driver": "sqlite",
            "path": "./data/didhub.sqlite"
        },
        "logging": {
            "json": true,
            "level": "debug"
        }
    });
    std::fs::write(
        &config_path,
        serde_json::to_string_pretty(&config_contents).unwrap(),
    )
    .unwrap();

    env::set_var("DIDHUB_CONFIG_FILE", &config_path);
    let cfg = AppConfig::from_env().unwrap();
    assert!(cfg.log_json);
    assert_eq!(cfg.log_level.as_deref(), Some("debug"));
    env::remove_var("DIDHUB_CONFIG_FILE");
}
