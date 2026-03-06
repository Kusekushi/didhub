use crate::auth::context::{AuthContext, AuthError};
use crate::auth::traits::AuthenticatorTrait;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tracing::warn;
use uuid::Uuid;

/// JWT verification options. Supports HS256 (shared secret) and RS256 (RSA public key PEM).
#[derive(Debug, Clone, Serialize, Deserialize)]
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
                warn!(sub = ?claims.sub, "JWT authentication failed: token expired");
                return Err(AuthError::TokenExpired);
            }
        }

        let sub = claims.sub.as_ref().and_then(|s| Uuid::parse_str(s).ok());
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

        let data = decode::<Claims>(token, &decoding, &validation).map_err(|e| {
            warn!(error = %e, "JWT decoding failed");
            AuthError::AuthenticationFailed
        })?;

        self.process_claims(data.claims)
    }
}
