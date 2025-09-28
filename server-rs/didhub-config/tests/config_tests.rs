use didhub_config::AppConfig;
use std::env;

#[test]
fn parse_comma_separated_origins() {
    env::set_var("FRONTEND_BASE_URL", "http://a.example.com, http://b.example.com");
    let cfg = AppConfig::from_env().unwrap();
    assert!(cfg.frontend_origins.len() >= 2);
}

#[test]
fn parse_json_array_origins() {
    env::set_var("FRONTEND_BASE_URL", r#"["http://x.local","http://y.local/"]"#);
    let cfg = AppConfig::from_env().unwrap();
    assert_eq!(cfg.frontend_origins.len(), 2);
}

#[test]
fn boolean_env_flags() {
    env::set_var("ALLOW_ALL_FRONTEND_ORIGINS", "true");
    env::set_var("LOG_FORMAT", "json");
    let cfg = AppConfig::from_env().unwrap();
    assert!(cfg.allow_all_frontend_origins);
    assert!(cfg.log_json);
}
