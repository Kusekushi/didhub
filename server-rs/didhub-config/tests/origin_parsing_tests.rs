use didhub_config::AppConfig;
use std::env;

mod test_utils;
use test_utils::with_env_lock;

#[test]
fn parse_comma_separated_origins() {
    with_env_lock(|| {
        env::set_var(
            "FRONTEND_BASE_URL",
            "http://a.example.com, http://b.example.com",
        );
        let cfg = AppConfig::from_env().unwrap();
        assert!(cfg.frontend_origins.len() >= 2);
    });
}

#[test]
fn parse_json_array_origins() {
    with_env_lock(|| {
        env::set_var(
            "FRONTEND_BASE_URL",
            r#"["http://x.local","http://y.local/"]"#,
        );
        let cfg = AppConfig::from_env().unwrap();
        assert_eq!(cfg.frontend_origins.len(), 2);
    });
}

#[test]
fn parse_origin_list_with_invalid_json_array_elements() {
    use didhub_config::parse_origin_list;

    // JSON array with non-string elements should filter them out
    let result = parse_origin_list(r#"["http://valid.com", 123, null, "http://another.com"]"#);
    assert_eq!(result, vec!["http://valid.com", "http://another.com"]);
}

#[test]
fn parse_origin_list_with_empty_json_array() {
    use didhub_config::parse_origin_list;

    let result = parse_origin_list(r#"[]"#);
    assert_eq!(result, Vec::<String>::new());
}

#[test]
fn parse_origin_list_with_malformed_json() {
    use didhub_config::parse_origin_list;

    // Malformed JSON should fall back to comma-separated parsing
    let result = parse_origin_list(r#"["unclosed array"#);
    assert_eq!(result, vec![r#"["unclosed array"#]);
}

#[test]
fn parse_origin_list_with_whitespace_and_empty_entries() {
    use didhub_config::parse_origin_list;

    let result = parse_origin_list("  http://a.com  ,  ,  http://b.com  ,   ");
    assert_eq!(result, vec!["http://a.com", "http://b.com"]);
}