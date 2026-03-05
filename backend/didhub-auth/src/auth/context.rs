use serde::{Deserialize, Serialize};
use serde_json::Value;
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
    #[error("insufficient permissions")]
    Forbidden,
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
