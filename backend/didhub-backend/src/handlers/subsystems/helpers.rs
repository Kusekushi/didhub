use serde_json::{json, Value};
use sqlx::types::Uuid as SqlxUuid;

use crate::error::ApiError;
use didhub_db::generated::subsystems as db_subsystems;

pub fn subsystem_to_payload(row: &db_subsystems::SubsystemsRow) -> Value {
    json!({
        "id": row.id,
        "name": row.name,
        "systemId": row.owner_user_id,
        "createdAt": row.created_at,
    })
}

pub fn parse_owner_filter(owner: Option<String>) -> Result<Option<SqlxUuid>, ApiError> {
    match owner {
        Some(o) => {
            let parsed = SqlxUuid::parse_str(&o)
                .map_err(|_| ApiError::bad_request("invalid owner_user_id"))?;
            Ok(Some(parsed))
        }
        None => Ok(None),
    }
}
