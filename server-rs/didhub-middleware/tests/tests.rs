use didhub_middleware::csrf::{is_safe_method, is_allowlisted, generate_token, build_cookie};

#[test]
fn test_is_safe_method() {
    assert!(is_safe_method("GET"));
    assert!(is_safe_method("HEAD"));
    assert!(is_safe_method("OPTIONS"));
    assert!(is_safe_method("TRACE"));

    assert!(!is_safe_method("POST"));
    assert!(!is_safe_method("PUT"));
    assert!(!is_safe_method("DELETE"));
    assert!(!is_safe_method("PATCH"));
}

#[test]
fn test_is_allowlisted() {
    assert!(is_allowlisted("/api/auth/login"));
    assert!(is_allowlisted("/api/auth/logout"));
    assert!(is_allowlisted("/api/password-reset/request"));
    assert!(is_allowlisted("/api/password-reset/reset"));

    assert!(!is_allowlisted("/api/users"));
    assert!(!is_allowlisted("/api/posts"));
    assert!(!is_allowlisted("/"));
    assert!(!is_allowlisted("/api/admin"));
}

#[test]
fn test_generate_token() {
    let token1 = generate_token();
    let token2 = generate_token();

    // Tokens should be different (random)
    assert_ne!(token1, token2);

    // Should be base64 URL-safe encoded (no padding)
    assert!(!token1.contains('='));
    assert!(!token1.contains('+'));
    assert!(!token1.contains('/'));

    // Should be 43 characters (32 bytes base64 encoded without padding)
    assert_eq!(token1.len(), 43);
    assert_eq!(token2.len(), 43);
}

#[test]
fn test_build_cookie() {
    let token = "test_token_value";
    let cookie = build_cookie(token);

    assert!(cookie.contains("csrf_token=test_token_value"));
    assert!(cookie.contains("Path=/"));
    assert!(cookie.contains("SameSite=Strict"));

    // Should include Secure unless DIDHUB_DISABLE_SECURE is set
    std::env::remove_var("DIDHUB_DISABLE_SECURE");
    let cookie_secure = build_cookie(token);
    assert!(cookie_secure.contains("Secure"));

    // Set env var to disable secure
    std::env::set_var("DIDHUB_DISABLE_SECURE", "1");
    let cookie_no_secure = build_cookie(token);
    assert!(!cookie_no_secure.contains("Secure"));

    // Clean up
    std::env::remove_var("DIDHUB_DISABLE_SECURE");
}