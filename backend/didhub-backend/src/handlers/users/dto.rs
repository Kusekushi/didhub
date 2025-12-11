use crate::validation::ValidationIssue;
use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum DtoError {
    #[error("missing field: {0}")]
    MissingField(&'static str),
    #[error("invalid field: {0}")]
    InvalidField(&'static str),
}

#[derive(Debug, Deserialize, Serialize)]
pub struct CreateUserDto {
    pub username: String,
    #[serde(alias = "passwordHash")]
    pub password_hash: String,
    pub display_name: Option<String>,
    pub about_me: Option<String>,
    /// Roles to assign to the user (e.g., ["admin", "system", "user"])
    pub roles: Option<Vec<String>>,
}

impl CreateUserDto {
    pub fn validate(&self) -> Result<(), Vec<ValidationIssue>> {
        let mut issues: Vec<ValidationIssue> = Vec::new();
        if self.username.trim().is_empty() {
            issues.push(ValidationIssue::new(
                "username",
                "missing",
                "username is required",
            ));
        }
        if let Some(display_name) = &self.display_name {
            if display_name.trim().is_empty() {
                issues.push(ValidationIssue::new(
                    "display_name",
                    "empty",
                    "display_name cannot be empty if provided",
                ));
            }
        }
        // Validate password_hash: either 64 hex chars (SHA-256) or 8+ chars (legacy plaintext)
        if didhub_auth::is_client_hash(&self.password_hash) {
            // Valid SHA-256 hash format
        } else if self.password_hash.len() < 8 {
            issues.push(ValidationIssue::new(
                "passwordHash",
                "too_short",
                "password must be at least 8 characters",
            ));
        }
        if issues.is_empty() {
            Ok(())
        } else {
            Err(issues)
        }
    }
}

#[derive(Debug, Deserialize, Serialize)]
pub struct UpdateUserDto {
    pub display_name: Option<String>,
    pub about_me: Option<String>,
    /// Roles to assign to the user (e.g., ["admin", "system", "user"])
    pub roles: Option<Vec<String>>,
}

impl UpdateUserDto {
    pub fn validate(&self) -> Result<(), Vec<ValidationIssue>> {
        // for now no checks; return Ok
        Ok(())
    }
}
