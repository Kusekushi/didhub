use didhub_db::generated::instance_settings::find_first_by_key;
use serde::Deserialize;
use sqlx::Pool;

use crate::error::ApiError;

#[derive(Deserialize, Debug)]
pub struct CustomRelationshipType {
    pub value: String,
    pub label: String,
}

pub async fn validate_relationship_type(
    db_pool: &Pool<didhub_db::DbBackend>,
    relation_type: &str,
) -> Result<(), ApiError> {
    // 1. Built-in types are always valid
    if relation_type == "parent" || relation_type == "spouse" {
        return Ok(());
    }

    // 2. Check instance settings for custom types
    let mut conn = db_pool.acquire().await.map_err(ApiError::from)?;
    let setting = find_first_by_key(conn.as_mut(), &"custom_relationship_types".to_string())
        .await
        .map_err(ApiError::from)?;

    if let Some(row) = setting {
        if let Some(json_str) = row.value_string {
            let custom_types: Vec<CustomRelationshipType> = serde_json::from_str(&json_str)
                .map_err(|e| {
                    tracing::error!(%e, "Failed to parse custom_relationship_types setting");
                    ApiError::internal_error("Invalid custom_relationship_types configuration")
                })?;

            if custom_types.iter().any(|t| t.value == relation_type) {
                return Ok(());
            }
        }
    }

    Err(ApiError::bad_request(format!(
        "Invalid relationship type: {}. Allowed types are 'parent', 'spouse', or custom types defined by administrator.",
        relation_type
    )))
}
