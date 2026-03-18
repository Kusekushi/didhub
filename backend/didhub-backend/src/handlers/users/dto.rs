use crate::validation::ValidationIssue;
use didhub_db::generated::users::UsersRow;
use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum DtoError {
    #[error("missing field: {0}")]
    MissingField(&'static str),
    #[error("invalid field: {0}")]
    InvalidField(&'static str),
}

#[derive(Debug, Serialize)]
pub struct UserPublic {
    pub id: String,
    pub username: String,
    pub display_name: Option<String>,
    pub avatar: Option<String>,
    pub about_me: Option<String>,
    pub roles: Vec<String>,
    pub is_admin: bool,
    pub is_system: bool,
    pub is_approved: bool,
    pub created_at: String,
    pub updated_at: String,
}

impl From<UsersRow> for UserPublic {
    fn from(row: UsersRow) -> Self {
        let roles: Vec<String> = serde_json::from_str(&row.roles).unwrap_or_default();
        let is_admin = roles.iter().any(|r| r == "admin");
        let is_system = roles.iter().any(|r| r == "system");
        let is_approved = roles.iter().any(|r| r == "user");

        Self {
            id: row.id.to_string(),
            username: row.username,
            display_name: row.display_name,
            avatar: row.avatar,
            about_me: row.about_me,
            roles,
            is_admin,
            is_system,
            is_approved,
            created_at: row.created_at,
            updated_at: row.updated_at,
        }
    }
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
        if didhub_auth::auth::is_client_hash(&self.password_hash) {
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
