//! Lightweight authentication facade used by the backend service.
//!
//! Provides:
//! - JWT token verification (HS256/RS256)
//! - Password hashing with Argon2id
//! - Client-side hash validation (for pre-hashed passwords from frontend)
//! - Authentication context and error types

use argon2::{
    password_hash::{
        rand_core::OsRng, PasswordHash, PasswordHasher as Argon2PasswordHasher, PasswordVerifier,
        SaltString,
    },
    Argon2,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use thiserror::Error;
use uuid::Uuid;

// ============================================================================
// Authentication Context
// ============================================================================

/// Captures the outcome of an authentication attempt.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthContext {
    pub user_id: Option<Uuid>,
    pub scopes: Vec<String>,
    pub metadata: Value,
}

impl AuthContext {
    /// Build a new context describing the currently authenticated subject.
    #[inline]
    pub fn new(user_id: Option<Uuid>, scopes: Vec<String>, metadata: Value) -> Self {
        Self {
            user_id,
            scopes,
            metadata,
        }
    }

    /// Helper for anonymous requests.
    #[inline]
    pub fn anonymous() -> Self {
        Self::new(None, vec!["anonymous".into()], Value::Null)
    }

    /// Indicates if the request represents an authenticated user.
    #[inline]
    pub fn is_authenticated(&self) -> bool {
        self.user_id.is_some()
    }

    /// Check if the context has a specific scope.
    #[inline]
    pub fn has_scope(&self, scope: &str) -> bool {
        self.scopes.iter().any(|s| s == scope)
    }

    /// Check if the user is an admin.
    #[inline]
    pub fn is_admin(&self) -> bool {
        self.has_scope("admin")
    }
}

impl Default for AuthContext {
    fn default() -> Self {
        Self::anonymous()
    }
}

// ============================================================================
// Errors
// ============================================================================

/// Authentication errors that can surface during request processing.
#[derive(Debug, Error, Clone)]
pub enum AuthError {
    #[error("authentication failed")]
    AuthenticationFailed,
    #[error("token expired")]
    TokenExpired,
    #[error("invalid token format")]
    InvalidTokenFormat,
    #[error("authentication subsystem is unavailable: {0}")]
    Subsystem(String),
}

/// Password-related errors.
#[derive(Debug, Error, Clone)]
pub enum PasswordError {
    #[error("password hashing failed: {0}")]
    HashingFailed(String),
    #[error("password verification failed")]
    VerificationFailed,
    #[error("invalid hash format")]
    InvalidHashFormat,
    #[error("client hash validation failed: expected 64 hex characters")]
    InvalidClientHash,
}

// ============================================================================
// Authenticator Trait
// ============================================================================

/// Trait for authentication backends. Implement this for production and test authenticators.
#[async_trait::async_trait]
pub trait AuthenticatorTrait: Send + Sync + 'static {
    async fn authenticate(&self, token: Option<&str>) -> Result<AuthContext, AuthError>;
}

// ============================================================================
// Test Authenticator
// ============================================================================

/// Test-only authenticator helper that can be used by tests to assert RBAC flows.
#[derive(Debug, Default)]
pub struct TestAuthenticator {
    pub scopes: Vec<String>,
    pub user_id: Option<Uuid>,
}

impl TestAuthenticator {
    pub fn new_with_scopes(scopes: Vec<String>) -> Self {
        Self {
            scopes,
            user_id: None,
        }
    }

    pub fn new_with(scopes: Vec<String>, user_id: Option<Uuid>) -> Self {
        Self { scopes, user_id }
    }

    pub fn admin() -> Self {
        Self::new_with_scopes(vec!["admin".into(), "user".into()])
    }

    pub fn user(user_id: Uuid) -> Self {
        Self::new_with(vec!["user".into()], Some(user_id))
    }
}

#[async_trait::async_trait]
impl AuthenticatorTrait for TestAuthenticator {
    async fn authenticate(&self, _token: Option<&str>) -> Result<AuthContext, AuthError> {
        Ok(AuthContext::new(
            self.user_id,
            self.scopes.clone(),
            Value::Null,
        ))
    }
}

// ============================================================================
// JWT Authenticator
// ============================================================================

/// JWT verification options. Supports HS256 (shared secret) and RS256 (RSA public key PEM).
#[derive(Debug, Clone)]
pub enum JwtKey {
    /// HMAC-SHA256 shared secret
    Hs256(String),
    /// PEM-encoded RSA public key
    Rs256(String),
}

/// JWT-based authenticator supporting HS256 and RS256 algorithms.
#[derive(Debug, Clone)]
pub struct JwtAuthenticator {
    key: JwtKey,
    /// Grace period in seconds for token expiration (default: 60)
    exp_grace_seconds: u64,
}

impl JwtAuthenticator {
    pub fn new_hs256(secret: impl Into<String>) -> Self {
        Self {
            key: JwtKey::Hs256(secret.into()),
            exp_grace_seconds: 60,
        }
    }

    pub fn new_rs256(pem_public_key: impl Into<String>) -> Self {
        Self {
            key: JwtKey::Rs256(pem_public_key.into()),
            exp_grace_seconds: 60,
        }
    }

    /// Set the grace period for token expiration checks.
    pub fn with_exp_grace(mut self, seconds: u64) -> Self {
        self.exp_grace_seconds = seconds;
        self
    }

    /// Extract and validate claims from a decoded token.
    fn process_claims(&self, claims: Claims) -> Result<AuthContext, AuthError> {
        // Time-based validation
        if let Some(exp) = claims.exp {
            let now = chrono::Utc::now().timestamp() as u64;
            if exp < now.saturating_sub(self.exp_grace_seconds) {
                return Err(AuthError::TokenExpired);
            }
        }

        let sub = claims.sub.and_then(|s| Uuid::parse_str(&s).ok());
        let scopes = match (claims.scope, claims.scopes) {
            (Some(s), _) => s.split_whitespace().map(String::from).collect(),
            (_, Some(arr)) => arr,
            _ => vec!["user".into()],
        };

        Ok(AuthContext::new(sub, scopes, Value::Null))
    }

    /// Strip the "Bearer " prefix from a token if present.
    #[inline]
    fn strip_bearer(token: &str) -> &str {
        let token = token.trim();
        if token.len() > 7 && token[..7].eq_ignore_ascii_case("bearer ") {
            &token[7..]
        } else {
            token
        }
    }
}

#[derive(Debug, Deserialize)]
struct Claims {
    sub: Option<String>,
    exp: Option<u64>,
    /// Space-separated scope string (OAuth2 style)
    scope: Option<String>,
    /// Array of scopes
    scopes: Option<Vec<String>>,
}

#[async_trait::async_trait]
impl AuthenticatorTrait for JwtAuthenticator {
    async fn authenticate(&self, token: Option<&str>) -> Result<AuthContext, AuthError> {
        let token = match token {
            Some(t) if !t.trim().is_empty() => Self::strip_bearer(t),
            _ => return Ok(AuthContext::anonymous()),
        };

        use jsonwebtoken::{decode, Algorithm, DecodingKey, Validation};

        let (decoding, algorithm) = match &self.key {
            JwtKey::Hs256(secret) => (
                DecodingKey::from_secret(secret.as_bytes()),
                Algorithm::HS256,
            ),
            JwtKey::Rs256(pem) => {
                let key = DecodingKey::from_rsa_pem(pem.as_bytes())
                    .map_err(|_| AuthError::Subsystem("invalid RSA public key".into()))?;
                (key, Algorithm::RS256)
            }
        };

        let mut validation = Validation::new(algorithm);
        validation.validate_exp = false; // We handle exp manually for grace period

        let data = decode::<Claims>(token, &decoding, &validation)
            .map_err(|_| AuthError::AuthenticationFailed)?;

        self.process_claims(data.claims)
    }
}

// ============================================================================
// Password Hashing
// ============================================================================

/// Password hasher using Argon2id (the recommended variant for password hashing).
#[derive(Debug, Clone)]
pub struct Argon2Hasher {
    /// Memory cost in KiB (default: 19456 = 19 MiB)
    m_cost: u32,
    /// Time cost / iterations (default: 2)
    t_cost: u32,
    /// Parallelism factor (default: 1)
    p_cost: u32,
}

impl Default for Argon2Hasher {
    fn default() -> Self {
        // OWASP recommended minimum parameters for Argon2id
        Self {
            m_cost: 19456, // 19 MiB
            t_cost: 2,
            p_cost: 1,
        }
    }
}

impl Argon2Hasher {
    pub fn new() -> Self {
        Self::default()
    }

    /// Configure memory cost in KiB.
    pub fn with_memory_cost(mut self, kib: u32) -> Self {
        self.m_cost = kib;
        self
    }

    /// Configure time cost (iterations).
    pub fn with_time_cost(mut self, iterations: u32) -> Self {
        self.t_cost = iterations;
        self
    }

    /// Configure parallelism factor.
    pub fn with_parallelism(mut self, threads: u32) -> Self {
        self.p_cost = threads;
        self
    }

    fn argon2(&self) -> Argon2<'_> {
        Argon2::new(
            argon2::Algorithm::Argon2id,
            argon2::Version::V0x13,
            argon2::Params::new(self.m_cost, self.t_cost, self.p_cost, None)
                .expect("valid argon2 params"),
        )
    }

    /// Hash a password, returning the PHC-format hash string.
    ///
    /// The input can be either:
    /// - A plaintext password (will be hashed directly)
    /// - A client-side SHA-256 hash (64 hex chars, will be hashed with Argon2)
    pub fn hash(&self, password: &str) -> Result<String, PasswordError> {
        let salt = SaltString::generate(&mut OsRng);
        let argon2 = self.argon2();

        argon2
            .hash_password(password.as_bytes(), &salt)
            .map(|h| h.to_string())
            .map_err(|e| PasswordError::HashingFailed(e.to_string()))
    }

    /// Hash a client-side pre-hashed password.
    ///
    /// The frontend sends SHA-256(password) as a 64-character hex string.
    /// We validate the format and then hash it with Argon2.
    pub fn hash_client_prehash(&self, client_hash: &str) -> Result<String, PasswordError> {
        validate_client_hash(client_hash)?;
        self.hash(client_hash)
    }

    /// Verify a password against a stored PHC-format hash.
    pub fn verify(&self, password: &str, stored_hash: &str) -> Result<(), PasswordError> {
        let parsed =
            PasswordHash::new(stored_hash).map_err(|_| PasswordError::InvalidHashFormat)?;

        self.argon2()
            .verify_password(password.as_bytes(), &parsed)
            .map_err(|_| PasswordError::VerificationFailed)
    }

    /// Verify a client-side pre-hashed password against a stored hash.
    pub fn verify_client_prehash(
        &self,
        client_hash: &str,
        stored_hash: &str,
    ) -> Result<(), PasswordError> {
        validate_client_hash(client_hash)?;
        self.verify(client_hash, stored_hash)
    }
}

// ============================================================================
// Client Hash Utilities
// ============================================================================

/// Expected length of a SHA-256 hex-encoded hash.
pub const CLIENT_HASH_LENGTH: usize = 64;

/// Validate that a client-provided hash is a valid 64-character hex string.
#[inline]
pub fn validate_client_hash(hash: &str) -> Result<(), PasswordError> {
    if hash.len() != CLIENT_HASH_LENGTH {
        return Err(PasswordError::InvalidClientHash);
    }
    if !hash.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err(PasswordError::InvalidClientHash);
    }
    Ok(())
}

/// Check if a string looks like a client-side SHA-256 hash (64 hex chars).
#[inline]
pub fn is_client_hash(input: &str) -> bool {
    input.len() == CLIENT_HASH_LENGTH && input.chars().all(|c| c.is_ascii_hexdigit())
}

/// Compute SHA-256 hash of input and return as lowercase hex string.
/// This is provided for testing purposes; the frontend should use Web Crypto API.
pub fn sha256_hex(input: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(input.as_bytes());
    hex::encode(hasher.finalize())
}

// ============================================================================
// Convenience Functions
// ============================================================================

/// Hash a password using default Argon2id parameters.
#[inline]
pub fn hash_password(password: &str) -> Result<String, PasswordError> {
    Argon2Hasher::new().hash(password)
}

/// Hash a client pre-hashed password using default Argon2id parameters.
#[inline]
pub fn hash_client_password(client_hash: &str) -> Result<String, PasswordError> {
    Argon2Hasher::new().hash_client_prehash(client_hash)
}

/// Verify a password against a stored hash using default parameters.
#[inline]
pub fn verify_password(password: &str, stored_hash: &str) -> Result<(), PasswordError> {
    Argon2Hasher::new().verify(password, stored_hash)
}

/// Verify a client pre-hashed password against a stored hash.
#[inline]
pub fn verify_client_password(client_hash: &str, stored_hash: &str) -> Result<(), PasswordError> {
    Argon2Hasher::new().verify_client_prehash(client_hash, stored_hash)
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

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
}
