use didhub_auth::{
    extract_bearer_token, sign_jwt, validate_password_strength, MUST_CHANGE_PASSWORD_ALLOW,
};
use didhub_config::AppConfig;
use jsonwebtoken::{decode, Algorithm, DecodingKey, Validation};

#[test]
fn test_validate_password_strength_valid() {
    assert_eq!(validate_password_strength("ValidPass123"), None);
    assert_eq!(validate_password_strength("Strong_P@ssw0rd!"), None);
}

#[test]
fn test_validate_password_strength_too_short() {
    assert_eq!(
        validate_password_strength("Short1"),
        Some("password too short. want at least 8 characters.".to_string())
    );
}

#[test]
fn test_validate_password_strength_too_long() {
    let long_password = "A".repeat(129);
    assert_eq!(
        validate_password_strength(&long_password),
        Some("password too long. maximum 128 characters.".to_string())
    );
}

#[test]
fn test_validate_password_strength_no_uppercase() {
    assert_eq!(
        validate_password_strength("lowercase123"),
        Some("password must contain at least one uppercase letter.".to_string())
    );
}

#[test]
fn test_validate_password_strength_no_lowercase() {
    assert_eq!(
        validate_password_strength("UPPERCASE123"),
        Some("password must contain at least one lowercase letter.".to_string())
    );
}

#[test]
fn test_validate_password_strength_no_digit() {
    assert_eq!(
        validate_password_strength("Password"),
        Some("password must contain at least one digit.".to_string())
    );
}

#[test]
fn test_validate_password_strength_common_password() {
    // These should fail basic requirements first, not common password check
    assert_eq!(
        validate_password_strength("password123"),
        Some("password must contain at least one uppercase letter.".to_string())
    );
    assert_eq!(
        validate_password_strength("qwerty123"),
        Some("password must contain at least one uppercase letter.".to_string())
    );

    // These should pass basic requirements but fail common password check
    assert_eq!(
        validate_password_strength("Password123"),
        Some("password is too common. please choose a stronger password.".to_string())
    );
    assert_eq!(
        validate_password_strength("Qwerty123"),
        Some("password is too common. please choose a stronger password.".to_string())
    );
}

#[test]
fn test_extract_bearer_token_valid() {
    assert_eq!(
        extract_bearer_token(Some("Bearer token123")),
        Some("token123".to_string())
    );
    assert_eq!(
        extract_bearer_token(Some("bearer token123")),
        Some("token123".to_string())
    );
    assert_eq!(
        extract_bearer_token(Some("BEARER token123")),
        Some("token123".to_string())
    );
}

#[test]
fn test_extract_bearer_token_invalid() {
    assert_eq!(extract_bearer_token(Some("Basic token123")), None);
    assert_eq!(extract_bearer_token(Some("Bearer")), None);
    assert_eq!(extract_bearer_token(Some("Bearer ")), None);
    assert_eq!(extract_bearer_token(Some("")), None);
    assert_eq!(extract_bearer_token(None), None);
}

#[test]
fn test_extract_bearer_token_edge_cases() {
    assert_eq!(
        extract_bearer_token(Some("Bearer   token")),
        Some("token".to_string())
    );
    assert_eq!(
        extract_bearer_token(Some("Bearer\ttoken")),
        Some("token".to_string())
    );
    assert_eq!(
        extract_bearer_token(Some("Bearer token with spaces")),
        Some("token with spaces".to_string())
    );
}

#[test]
fn test_sign_jwt() {
    let config = AppConfig::default_for_tests();

    let token = sign_jwt(&config, "testuser").unwrap();
    assert!(!token.is_empty());
    assert!(token.contains(".")); // JWT format has dots

    // Test that we can decode it back
    let decoded = decode::<didhub_auth::Claims>(
        &token,
        &DecodingKey::from_secret(config.jwt_secret.as_bytes()),
        &Validation::new(Algorithm::HS256),
    )
    .unwrap();

    assert_eq!(decoded.claims.sub, "testuser");
    assert!(decoded.claims.exp > 0);
}

#[test]
fn test_sign_jwt_different_users() {
    let config = AppConfig::default_for_tests();

    let token1 = sign_jwt(&config, "user1").unwrap();
    let token2 = sign_jwt(&config, "user2").unwrap();

    let decoded1 = decode::<didhub_auth::Claims>(
        &token1,
        &DecodingKey::from_secret(config.jwt_secret.as_bytes()),
        &Validation::new(Algorithm::HS256),
    )
    .unwrap();

    let decoded2 = decode::<didhub_auth::Claims>(
        &token2,
        &DecodingKey::from_secret(config.jwt_secret.as_bytes()),
        &Validation::new(Algorithm::HS256),
    )
    .unwrap();

    assert_eq!(decoded1.claims.sub, "user1");
    assert_eq!(decoded2.claims.sub, "user2");
    assert_ne!(token1, token2);
}

#[test]
fn test_must_change_password_allow_list() {
    assert!(MUST_CHANGE_PASSWORD_ALLOW.contains(&"/api/me"));
    assert!(MUST_CHANGE_PASSWORD_ALLOW.contains(&"/api/me/password"));
    assert!(MUST_CHANGE_PASSWORD_ALLOW.contains(&"/api/password-reset/request"));
    assert!(MUST_CHANGE_PASSWORD_ALLOW.contains(&"/api/password-reset/verify"));
    assert!(MUST_CHANGE_PASSWORD_ALLOW.contains(&"/api/password-reset/consume"));
}

// Additional comprehensive tests
#[test]
fn test_validate_password_strength_comprehensive() {
    // Test various edge cases
    assert_eq!(
        validate_password_strength(""),
        Some("password too short. want at least 8 characters.".to_string())
    );
    assert_eq!(
        validate_password_strength("1234567"),
        Some("password too short. want at least 8 characters.".to_string())
    );
    assert_eq!(
        validate_password_strength("12345678"),
        Some("password must contain at least one uppercase letter.".to_string())
    ); // Exactly 8 chars but no uppercase
    assert_eq!(
        validate_password_strength("password"),
        Some("password must contain at least one uppercase letter.".to_string())
    );
    assert_eq!(
        validate_password_strength("PASSWORD"),
        Some("password must contain at least one lowercase letter.".to_string())
    );
    assert_eq!(
        validate_password_strength("Password"),
        Some("password must contain at least one digit.".to_string())
    );

    // Test weak passwords (these pass basic requirements but are common)
    assert_eq!(
        validate_password_strength("Password123"),
        Some("password is too common. please choose a stronger password.".to_string())
    );
    assert_eq!(
        validate_password_strength("Qwerty123"),
        Some("password is too common. please choose a stronger password.".to_string())
    );

    // Test length limits
    let long_password = "A".repeat(129);
    assert_eq!(
        validate_password_strength(&long_password),
        Some("password too long. maximum 128 characters.".to_string())
    );

    // Test valid passwords
    assert_eq!(validate_password_strength("ValidPass123!@#"), None);
    assert_eq!(validate_password_strength("Str0ng_P@ssw0rd"), None);
    assert_eq!(validate_password_strength("123456Aa"), None);
}

#[test]
fn test_extract_bearer_token_comprehensive() {
    // Valid cases
    assert_eq!(
        extract_bearer_token(Some("Bearer token123")),
        Some("token123".to_string())
    );
    assert_eq!(
        extract_bearer_token(Some("bearer token123")),
        Some("token123".to_string())
    );
    assert_eq!(
        extract_bearer_token(Some("BEARER token123")),
        Some("token123".to_string())
    );

    // Invalid cases
    assert_eq!(extract_bearer_token(Some("Basic token123")), None);
    assert_eq!(extract_bearer_token(Some("Bearer")), None);
    assert_eq!(extract_bearer_token(Some("Bearer ")), None);
    assert_eq!(extract_bearer_token(Some("")), None);
    assert_eq!(
        extract_bearer_token(Some("Bearer token with spaces")),
        Some("token with spaces".to_string())
    );
    assert_eq!(
        extract_bearer_token(Some("Bearer\ttabbed")),
        Some("tabbed".to_string())
    );
    assert_eq!(extract_bearer_token(None), None);
}

#[test]
fn test_sign_jwt_comprehensive() {
    let config = AppConfig::default_for_tests();

    // Test successful JWT creation
    let token = sign_jwt(&config, "testuser").unwrap();
    assert!(!token.is_empty());
    assert!(token.contains(".")); // JWT format has dots

    // Test that we can decode it back
    let decoded = decode::<didhub_auth::Claims>(
        &token,
        &DecodingKey::from_secret(config.jwt_secret.as_bytes()),
        &Validation::new(Algorithm::HS256),
    )
    .unwrap();

    assert_eq!(decoded.claims.sub, "testuser");
    assert!(decoded.claims.exp > 0);

    // Test with different usernames
    let token2 = sign_jwt(&config, "anotheruser").unwrap();
    let decoded2 = decode::<didhub_auth::Claims>(
        &token2,
        &DecodingKey::from_secret(config.jwt_secret.as_bytes()),
        &Validation::new(Algorithm::HS256),
    )
    .unwrap();
    assert_eq!(decoded2.claims.sub, "anotheruser");
}

#[test]
fn test_must_change_password_allow_list_comprehensive() {
    let allowed = MUST_CHANGE_PASSWORD_ALLOW;

    // Test all expected paths are present
    assert!(allowed.contains(&"/api/me"));
    assert!(allowed.contains(&"/api/me/password"));
    assert!(allowed.contains(&"/api/password-reset/request"));
    assert!(allowed.contains(&"/api/password-reset/verify"));
    assert!(allowed.contains(&"/api/password-reset/consume"));

    // Test that other paths are not allowed
    assert!(!allowed.contains(&"/api/users"));
    assert!(!allowed.contains(&"/api/admin"));
    assert!(!allowed.contains(&"/api/some-other-endpoint"));

    // Test exact count
    assert_eq!(allowed.len(), 5);
}

#[cfg(test)]
mod handler_tests {
    use didhub_auth::me_handler;
    use didhub_middleware::types::CurrentUser;

    #[tokio::test]
    async fn test_me_handler() {
        // Create a mock CurrentUser
        let user = CurrentUser {
            id: "0199ccdc-5016-7c30-9ab1-cf9009f53fcb".to_string(), // Random v7 UUID
            username: "testuser".to_string(),
            avatar: Some("avatar.png".to_string()),
            is_admin: 1,
            is_system: 0,
            is_approved: 1,
            must_change_password: 0,
        };

        // Test the me_handler function
        let result = me_handler(axum::extract::Extension(user)).await;

        match result {
            Ok(_) => {
                // The response should be successful
                assert!(true); // If we get here, the handler succeeded
            }
            Err(_) => panic!("me_handler should not return an error"),
        }
    }
}

#[cfg(test)]
mod middleware_tests {
    use didhub_auth::MUST_CHANGE_PASSWORD_ALLOW;

    #[test]
    fn test_must_change_password_allow_list_paths() {
        // Test that the allow list contains expected paths
        assert!(MUST_CHANGE_PASSWORD_ALLOW.contains(&"/api/me"));
        assert!(MUST_CHANGE_PASSWORD_ALLOW.contains(&"/api/me/password"));
        assert!(MUST_CHANGE_PASSWORD_ALLOW.contains(&"/api/password-reset/request"));
        assert!(MUST_CHANGE_PASSWORD_ALLOW.contains(&"/api/password-reset/verify"));
        assert!(MUST_CHANGE_PASSWORD_ALLOW.contains(&"/api/password-reset/consume"));

        // Test that it doesn't contain other paths
        assert!(!MUST_CHANGE_PASSWORD_ALLOW.contains(&"/api/users"));
        assert!(!MUST_CHANGE_PASSWORD_ALLOW.contains(&"/api/admin"));
    }
}
