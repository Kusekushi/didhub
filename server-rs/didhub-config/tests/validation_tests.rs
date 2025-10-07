use didhub_config::AppConfig;

#[test]
fn validate_config_accepts_valid_config() {
    let mut cfg = AppConfig::default_for_tests();
    cfg.jwt_secret = "a".repeat(32);
    cfg.db_url = Some("sqlite://test.db".to_string());
    cfg.upload_dir = "uploads".to_string();
    cfg.allow_all_frontend_origins = true;
    cfg.port = 8080;
    cfg.update_check_interval_hours = 24;
    assert!(cfg.validate().is_ok());
}

#[test]
fn validate_config_rejects_weak_jwt_secret() {
    let mut cfg = AppConfig::default_for_tests();
    cfg.jwt_secret = "dev-secret-change-me".to_string();
    cfg.db_url = Some("sqlite://test.db".to_string());
    assert!(cfg.validate().is_err());
    assert!(cfg
        .validate()
        .unwrap_err()
        .to_string()
        .contains("DIDHUB_SECRET"));
}

#[test]
fn validate_config_rejects_short_jwt_secret() {
    let mut cfg = AppConfig::default_for_tests();
    cfg.jwt_secret = "short".to_string();
    cfg.db_url = Some("sqlite://test.db".to_string());
    assert!(cfg.validate().is_err());
    assert!(cfg
        .validate()
        .unwrap_err()
        .to_string()
        .contains("32 characters"));
}

#[test]
fn validate_config_rejects_missing_database_url() {
    let mut cfg = AppConfig::default_for_tests();
    cfg.jwt_secret = "a".repeat(32); // Set valid JWT secret so we get to DB check
    assert!(cfg.validate().is_err());
    assert!(cfg
        .validate()
        .unwrap_err()
        .to_string()
        .contains("Database URL"));
}

#[test]
fn validate_config_rejects_empty_upload_dir() {
    let mut cfg = AppConfig::default_for_tests();
    cfg.jwt_secret = "a".repeat(32);
    cfg.db_url = Some("sqlite://test.db".to_string());
    cfg.upload_dir = "".to_string();
    assert!(cfg.validate().is_err());
    assert!(cfg
        .validate()
        .unwrap_err()
        .to_string()
        .contains("Upload directory"));
}

#[test]
fn validate_config_rejects_empty_frontend_origins_when_not_allowing_all() {
    let mut cfg = AppConfig::default_for_tests();
    cfg.jwt_secret = "a".repeat(32);
    cfg.db_url = Some("sqlite://test.db".to_string());
    cfg.allow_all_frontend_origins = false;
    cfg.frontend_origins = vec![];
    assert!(cfg.validate().is_err());
    assert!(cfg
        .validate()
        .unwrap_err()
        .to_string()
        .contains("Frontend origins"));
}

#[test]
fn validate_config_rejects_invalid_port_zero() {
    let mut cfg = AppConfig::default_for_tests();
    cfg.jwt_secret = "a".repeat(32);
    cfg.db_url = Some("sqlite://test.db".to_string());
    cfg.port = 0;
    assert!(cfg.validate().is_err());
    assert!(cfg
        .validate()
        .unwrap_err()
        .to_string()
        .contains("Port must be between"));
}

#[test]
fn validate_config_rejects_zero_update_interval() {
    let mut cfg = AppConfig::default_for_tests();
    cfg.jwt_secret = "a".repeat(32);
    cfg.db_url = Some("sqlite://test.db".to_string());
    cfg.port = 8080; // Set valid port so we get to update interval check
    cfg.update_check_interval_hours = 0;
    assert!(cfg.validate().is_err());
    assert!(cfg
        .validate()
        .unwrap_err()
        .to_string()
        .contains("Update check interval"));
}
