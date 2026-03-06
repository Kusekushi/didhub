use crate::error::ApiError;
use didhub_db::generated::affiliations as db_affiliations;
use didhub_db::generated::alters as db_alters;
use didhub_db::generated::users as db_users;
use serde_json::{json, Value};

pub fn parse_positive_usize(
    raw: Option<&String>,
    fallback: usize,
    field: &str,
) -> Result<usize, ApiError> {
    match raw {
        Some(value) => {
            let parsed = value.parse::<usize>().map_err(|_| {
                ApiError::bad_request(format!("{field} must be a positive integer"))
            })?;
            if parsed == 0 {
                return Err(ApiError::bad_request(format!("{field} must be at least 1")));
            }
            Ok(parsed)
        }
        None => Ok(fallback),
    }
}

/// Check if a user has a specific role by parsing the roles JSON
pub fn user_has_role(user: &db_users::UsersRow, role: &str) -> bool {
    serde_json::from_str::<Vec<String>>(&user.roles)
        .map(|roles| roles.iter().any(|r| r == role))
        .unwrap_or(false)
}

/// Check if a user has the 'system' role
pub fn user_is_system(user: &db_users::UsersRow) -> bool {
    user_has_role(user, "system")
}

pub fn affiliation_to_payload(row: &db_affiliations::AffiliationsRow) -> Value {
    json!({
        "id": row.id,
        "name": row.name,
        "description": row.description,
        "sigil": row.sigil,
        "systemId": row.owner_user_id,
        "createdAt": row.created_at,
    })
}

/// Helper to parse JSON string fields into arrays for the alter response.
/// This handles system_roles, soul_songs, interests, and triggers which are
/// stored as JSON strings in the database but should be returned as arrays.
pub fn parse_json_array_fields(
    obj: &mut serde_json::Map<String, Value>,
    row: &db_alters::AltersRow,
) {
    // Parse and replace JSON string fields with actual arrays
    let json_fields = [
        ("system_roles", &row.system_roles),
        ("soul_songs", &row.soul_songs),
        ("interests", &row.interests),
        ("triggers", &row.triggers),
    ];

    for (field_name, json_str) in json_fields {
        if let Ok(parsed) = serde_json::from_str::<Value>(json_str) {
            if parsed.is_array() {
                obj.insert(field_name.to_string(), parsed);
            }
        } else {
            // If parsing fails, insert an empty array
            obj.insert(field_name.to_string(), Value::Array(vec![]));
        }
    }

    // Also add camelCase versions for the frontend
    if let Some(v) = obj.get("system_roles").cloned() {
        obj.insert("systemRoles".to_string(), v);
    }
    if let Some(v) = obj.get("soul_songs").cloned() {
        obj.insert("soulSongs".to_string(), v);
    }
    // interests and triggers don't need camelCase conversion

    // Convert boolean fields from integers
    if let Some(v) = obj.get("is_system_host") {
        let b = v.as_i64().unwrap_or(0) != 0;
        obj.insert("isSystemHost".to_string(), Value::Bool(b));
    }
    if let Some(v) = obj.get("is_dormant") {
        let b = v.as_i64().unwrap_or(0) != 0;
        obj.insert("isDormant".to_string(), Value::Bool(b));
    }
    if let Some(v) = obj.get("is_merged") {
        let b = v.as_i64().unwrap_or(0) != 0;
        obj.insert("isMerged".to_string(), Value::Bool(b));
    }

    // Add camelCase for other fields
    if let Some(v) = obj.get("alter_type").cloned() {
        obj.insert("alterType".to_string(), v);
    }
}
