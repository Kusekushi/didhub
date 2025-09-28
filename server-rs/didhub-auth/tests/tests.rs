use didhub_auth::{extract_bearer_token, sign_jwt};
use didhub_config::AppConfig;

#[test]
fn test_extract_bearer_token_valid() {
    let header = "Bearer abc123";
    let result = extract_bearer_token(Some(header));
    assert_eq!(result, Some("abc123".to_string()));
}

#[test]
fn test_extract_bearer_token_invalid() {
    let header = "Basic abc123";
    let result = extract_bearer_token(Some(header));
    assert_eq!(result, None);
}

#[test]
fn test_extract_bearer_token_no_space() {
    let header = "Bearerabc123";
    let result = extract_bearer_token(Some(header));
    assert_eq!(result, None);
}

#[test]
fn test_extract_bearer_token_empty_token() {
    let header = "Bearer ";
    let result = extract_bearer_token(Some(header));
    assert_eq!(result, None);
}

#[test]
fn test_extract_bearer_token_case_sensitive() {
    let header = "bearer abc123";
    let result = extract_bearer_token(Some(header));
    assert_eq!(result, Some("abc123".to_string())); // Should be case-insensitive
}

#[test]
fn test_sign_jwt() {
    let config = AppConfig::default_for_tests();

    let token = sign_jwt(&config, "testuser").unwrap();
    assert!(!token.is_empty());
    assert!(token.contains("."));
}