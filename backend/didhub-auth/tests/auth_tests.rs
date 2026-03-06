use didhub_auth::auth::context::AuthContext;
use didhub_auth::auth::hashing::{is_client_hash, sha256_hex, validate_client_hash, Argon2Hasher};
use didhub_auth::auth::jwt::JwtAuthenticator;
use didhub_auth::auth::traits::AuthenticatorTrait;
use serde_json::Value;
use uuid::Uuid;

#[test]
fn test_password_hash_and_verify() {
    let hasher = Argon2Hasher::new();
    let password = "supersecret123";

    let hash = hasher.hash(password).expect("hash should succeed");
    assert!(hash.starts_with("$argon2id$"));

    hasher
        .verify(password, &hash)
        .expect("verification should succeed");

    assert!(hasher.verify("wrongpassword", &hash).is_err());
}

#[test]
fn test_client_hash_validation() {
    // Valid SHA-256 hash (64 hex chars)
    let valid_hash = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
    assert!(validate_client_hash(valid_hash).is_ok());
    assert!(is_client_hash(valid_hash));

    // Invalid: wrong length
    assert!(validate_client_hash("abc123").is_err());
    assert!(!is_client_hash("abc123"));

    // Invalid: non-hex characters
    let invalid_hash = "g3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
    assert!(validate_client_hash(invalid_hash).is_err());
}

#[test]
fn test_client_prehash_flow() {
    let password = "mypassword";
    let client_hash = sha256_hex(password);

    assert_eq!(client_hash.len(), 64);

    let hasher = Argon2Hasher::new();
    let stored = hasher
        .hash_client_prehash(&client_hash)
        .expect("hash should succeed");

    hasher
        .verify_client_prehash(&client_hash, &stored)
        .expect("verification should succeed");
}

#[test]
fn test_auth_context_helpers() {
    let admin = AuthContext::new(
        Some(Uuid::new_v4()),
        vec!["admin".into(), "user".into()],
        Value::Null,
    );
    assert!(admin.is_authenticated());
    assert!(admin.is_admin());
    assert!(admin.has_scope("user"));

    let anon = AuthContext::anonymous();
    assert!(!anon.is_authenticated());
    assert!(!anon.is_admin());
    assert!(anon.has_scope("anonymous"));
}

#[tokio::test]
async fn test_jwt_authenticator_anonymous() {
    let auth = JwtAuthenticator::new_hs256("secret");
    let ctx = auth.authenticate(None).await.unwrap();
    assert!(!ctx.is_authenticated());
    assert!(ctx.has_scope("anonymous"));
}
