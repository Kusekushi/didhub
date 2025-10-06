use didhub_config::AppConfig;
use std::env;

mod test_utils;
use test_utils::with_env_lock;

#[test]
fn config_summary_includes_key_fields() {
    let cfg = AppConfig::default_for_tests();
    let summary = cfg.summary();
    assert!(summary.contains("host=127.0.0.1"));
    assert!(summary.contains("port=0"));
    assert!(summary.contains("db_configured=false"));
    assert!(summary.contains("redis_configured=false"));
    assert!(summary.contains("auto_update_enabled=false"));
}

#[test]
fn default_for_tests_creates_test_config() {
    let cfg = AppConfig::default_for_tests();
    assert_eq!(cfg.host, "127.0.0.1");
    assert_eq!(cfg.port, 0);
    assert_eq!(cfg.jwt_secret, "test-secret");
    assert!(cfg.allow_all_frontend_origins);
    assert_eq!(cfg.frontend_origins, vec!["http://localhost"]);
    assert!(!cfg.log_json);
    assert_eq!(cfg.log_level, None);
    assert_eq!(cfg.upload_dir, "uploads");
    assert_eq!(cfg.redis_url, None);
    assert!(!cfg.auto_update_enabled);
    assert!(!cfg.auto_update_check);
    assert_eq!(cfg.update_repo, "Kusekushi/didhub");
    assert_eq!(cfg.update_check_interval_hours, 24);
}

#[test]
fn env_db_already_set_prevents_file_override() {
    with_env_lock(|| {
        env::set_var("FRONTEND_BASE_URL", "http://localhost:5173");
        env::set_var("DIDHUB_DB", "env-db-url");

        let unique = format!(
            "didhub-config-test-db-env-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        );
        let base_dir = std::env::temp_dir().join(unique);
        std::fs::create_dir_all(&base_dir).unwrap();
        let config_path = base_dir.join("config.json");

        let config_contents = serde_json::json!({
            "database": {
                "driver": "sqlite",
                "path": "./data/file-db.sqlite"
            }
        });
        std::fs::write(
            &config_path,
            serde_json::to_string_pretty(&config_contents).unwrap(),
        )
        .unwrap();

        env::set_var("DIDHUB_CONFIG_FILE", &config_path);
        let cfg = AppConfig::from_env().unwrap();
        // Environment variable should take precedence
        assert_eq!(cfg.db_url, Some("env-db-url".to_string()));

        env::remove_var("DIDHUB_CONFIG_FILE");
    });
}