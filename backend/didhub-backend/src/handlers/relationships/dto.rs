use crate::validation::ValidationIssue;
use didhub_db::generated::relationships::RelationshipsRow;
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

/// Response DTO for relationships - uses camelCase for JSON serialization
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RelationshipResponse {
    pub id: String,
    #[serde(rename = "relationType")]
    pub relation_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub side_a_user_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub side_a_alter_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub side_b_user_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub side_b_alter_id: Option<String>,
    pub past_life: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created_by: Option<String>,
    pub created_at: String,
}

impl From<RelationshipsRow> for RelationshipResponse {
    fn from(row: RelationshipsRow) -> Self {
        Self {
            id: row.id.to_string(),
            relation_type: row.r#type,
            side_a_user_id: row.side_a_user_id.map(|u| u.to_string()),
            side_a_alter_id: row.side_a_alter_id.map(|u| u.to_string()),
            side_b_user_id: row.side_b_user_id.map(|u| u.to_string()),
            side_b_alter_id: row.side_b_alter_id.map(|u| u.to_string()),
            past_life: row.past_life != 0,
            created_by: row.created_by.map(|u| u.to_string()),
            created_at: row.created_at,
        }
    }
}

#[derive(Debug, Deserialize, Serialize)]
pub struct UpdateRelationshipDto {
    pub r#type: Option<String>,
    pub side_a_user_id: Option<String>,
    pub side_a_alter_id: Option<String>,
    pub side_b_user_id: Option<String>,
    pub side_b_alter_id: Option<String>,
    pub past_life: Option<i32>,
}

impl UpdateRelationshipDto {
    pub fn validate(&self) -> Result<(), Vec<ValidationIssue>> {
        let mut issues: Vec<ValidationIssue> = Vec::new();
        if let Some(t) = &self.r#type {
            let t_trim = t.trim();
            if t_trim.is_empty() {
                issues.push(ValidationIssue::new(
                    "type",
                    "empty",
                    "type must not be empty",
                ));
            } else {
                if t_trim.chars().count() > 100 {
                    issues.push(ValidationIssue::new(
                        "type",
                        "too_long",
                        "type must be <= 100 chars",
                    ));
                }
                if t_trim.chars().any(|c| c.is_control()) {
                    issues.push(ValidationIssue::new(
                        "type",
                        "control_chars",
                        "type contains control characters",
                    ));
                }
                if !t_trim.chars().any(|c| c.is_alphanumeric()) {
                    issues.push(ValidationIssue::new(
                        "type",
                        "invalid_content",
                        "type must contain alphanumeric characters",
                    ));
                }
            }
        }
        for (name, val) in [
            ("side_a_user_id", &self.side_a_user_id),
            ("side_b_user_id", &self.side_b_user_id),
            ("side_a_alter_id", &self.side_a_alter_id),
            ("side_b_alter_id", &self.side_b_alter_id),
        ] {
            if let Some(s) = val {
                let s_trim = s.trim();
                if s_trim.is_empty() {
                    issues.push(ValidationIssue::new(name, "empty", "id must not be empty"));
                } else if Uuid::parse_str(s_trim).is_err() {
                    issues.push(ValidationIssue::new(
                        name,
                        "invalid_uuid",
                        "must be a valid UUID",
                    ));
                }
            }
        }
        if issues.is_empty() {
            Ok(())
        } else {
            Err(issues)
        }
    }
}
