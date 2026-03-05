pub mod context;
pub mod hashing;
pub mod jwt;
pub mod traits;

pub use context::{AuthContext, AuthError, PasswordError};
pub use hashing::{
    hash_client_password, hash_password, is_client_hash, sha256_hex, validate_client_hash,
    verify_client_password, verify_password, Argon2Hasher, CLIENT_HASH_LENGTH,
};
pub use jwt::{JwtAuthenticator, JwtKey};
pub use traits::AuthenticatorTrait;

use serde_json::Value;
use uuid::Uuid;

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
