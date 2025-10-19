use crate::validation::ValidationIssue;
use serde::{Deserialize, Serialize};
use thiserror::Error;
use uuid::Uuid;

#[derive(Debug, Error)]
pub enum DtoError {
    #[error("missing field: {0}")]
    MissingField(&'static str),
    #[error("invalid field: {0}")]
    InvalidField(&'static str),
}

#[derive(Debug, Default, Deserialize, Serialize)]
pub struct UpdateAlter {
    pub name: Option<String>,
    pub description: Option<String>,
    pub notes: Option<String>,
    #[serde(alias = "ownerUserId")]
    pub owner_user_id: Option<String>,
    pub age: Option<String>,
    pub gender: Option<String>,
    pub pronouns: Option<String>,
    pub birthday: Option<String>,
    pub sexuality: Option<String>,
    pub species: Option<String>,
    #[serde(alias = "alterType")]
    pub alter_type: Option<String>,
    pub job: Option<String>,
    pub weapon: Option<String>,
    #[serde(alias = "systemRoles")]
    pub system_roles: Option<Vec<String>>,
    #[serde(alias = "isSystemHost")]
    pub is_system_host: Option<bool>,
    #[serde(alias = "isDormant")]
    pub is_dormant: Option<bool>,
    #[serde(alias = "isMerged")]
    pub is_merged: Option<bool>,
    #[serde(alias = "soulSongs")]
    pub soul_songs: Option<Vec<String>>,
    pub interests: Option<Vec<String>>,
    pub triggers: Option<Vec<String>>,
    pub images: Option<Vec<String>>,
}

impl UpdateAlter {
    pub fn validate(&self) -> Result<(), Vec<ValidationIssue>> {
        let mut issues: Vec<ValidationIssue> = Vec::new();
        if let Some(name) = &self.name {
            let name_trim = name.trim();
            if name_trim.is_empty() {
                issues.push(ValidationIssue::new(
                    "name",
                    "empty",
                    "name must not be empty",
                ));
            } else {
                if name_trim.chars().count() > 200 {
                    issues.push(ValidationIssue::new(
                        "name",
                        "too_long",
                        "name must be <= 200 chars",
                    ));
                }
                if name_trim.chars().any(|c| c.is_control()) {
                    issues.push(ValidationIssue::new(
                        "name",
                        "control_chars",
                        "name contains control characters",
                    ));
                }
                if !name_trim.chars().any(|c| c.is_alphanumeric()) {
                    issues.push(ValidationIssue::new(
                        "name",
                        "invalid_content",
                        "name must contain alphanumeric characters",
                    ));
                }
            }
        }
        if let Some(uid) = &self.owner_user_id {
            if uid.trim().is_empty() {
                issues.push(ValidationIssue::new(
                    "owner_user_id",
                    "empty",
                    "owner_user_id must not be empty",
                ));
            } else if Uuid::parse_str(uid).is_err() {
                issues.push(ValidationIssue::new(
                    "owner_user_id",
                    "invalid_uuid",
                    "owner_user_id must be a valid UUID",
                ));
            }
        }
        if let Some(desc) = &self.description {
            let desc_trim = desc.trim();
            if desc_trim.chars().count() > 2000 {
                issues.push(ValidationIssue::new(
                    "description",
                    "too_long",
                    "description must be <= 2000 chars",
                ));
            }
            if desc_trim.chars().any(|c| c.is_control()) {
                issues.push(ValidationIssue::new(
                    "description",
                    "control_chars",
                    "description contains control characters",
                ));
            }
        }
        if let Some(notes) = &self.notes {
            let notes_trim = notes.trim();
            if notes_trim.chars().count() > 5000 {
                issues.push(ValidationIssue::new(
                    "notes",
                    "too_long",
                    "notes must be <= 5000 chars",
                ));
            }
            if notes_trim.chars().any(|c| c.is_control()) {
                issues.push(ValidationIssue::new(
                    "notes",
                    "control_chars",
                    "notes contains control characters",
                ));
            }
        }
        if issues.is_empty() {
            Ok(())
        } else {
            Err(issues)
        }
    }
}
