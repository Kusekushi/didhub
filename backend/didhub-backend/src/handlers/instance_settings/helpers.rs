use chrono::Utc;
use didhub_db::generated::instance_settings::InstanceSettingsRow;
use serde::Deserialize;
use serde_json::{json, Value};
use sqlx::pool::PoolConnection;

use crate::error::ApiError;

#[derive(Deserialize)]
pub struct InstanceSettingInput {
    #[serde(default)]
    pub key: String,
    pub value: String,
    #[serde(rename = "updatedAt", default)]
    pub _updated_at: Option<String>,
}

#[derive(Deserialize)]
pub struct InstanceSettingsPayload {
    pub items: Vec<InstanceSettingInput>,
}

#[derive(Deserialize)]
pub struct BulkGetRequest {
    pub keys: Vec<String>,
}

#[derive(Clone)]
pub struct ParsedValue {
    pub value_type: String,
    pub value_bool: Option<i32>,
    pub value_number: Option<f64>,
    pub value_string: Option<String>,
}

pub fn parse_value(raw: &str) -> ParsedValue {
    let trimmed = raw.trim();
    if trimmed.eq_ignore_ascii_case("true") || trimmed.eq_ignore_ascii_case("false") {
        let is_true = trimmed.eq_ignore_ascii_case("true");
        return ParsedValue {
            value_type: "bool".to_string(),
            value_bool: Some(if is_true { 1 } else { 0 }),
            value_number: None,
            value_string: None,
        };
    }

    if let Ok(number) = trimmed.parse::<f64>() {
        return ParsedValue {
            value_type: "number".to_string(),
            value_bool: None,
            value_number: Some(number),
            value_string: None,
        };
    }

    ParsedValue {
        value_type: "string".to_string(),
        value_bool: None,
        value_number: None,
        value_string: Some(raw.to_string()),
    }
}

pub fn row_to_setting(row: InstanceSettingsRow) -> Value {
    let value = match row.value_type.as_str() {
        "bool" => row
            .value_bool
            .map(|v| (v != 0).to_string())
            .unwrap_or_default(),
        "number" => row.value_number.map(|v| v.to_string()).unwrap_or_default(),
        _ => row
            .value_string
            .clone()
            .or_else(|| {
                row.value_bool
                    .map(|v| (v != 0).to_string())
                    .or_else(|| row.value_number.map(|n| n.to_string()))
            })
            .unwrap_or_default(),
    };

    json!({
        "key": row.key,
        "value": value,
        "valueType": row.value_type,
        "updatedAt": row.updated_at,
    })
}

pub async fn upsert_instance_setting(
    conn: &mut PoolConnection<didhub_db::DbBackend>,
    key: &str,
    raw_value: &str,
) -> Result<InstanceSettingsRow, ApiError> {
    let parsed = parse_value(raw_value);
    let now = Utc::now().to_rfc3339();

    let existing = sqlx::query_as::<_, InstanceSettingsRow>(
        "SELECT key, value_type, value_bool, value_number, value_string, created_at, updated_at FROM instance_settings WHERE key = ?",
    )
    .bind(key)
    .fetch_optional(conn.as_mut())
    .await
    .map_err(ApiError::from)?;

    if let Some(mut row) = existing {
        sqlx::query(
            "UPDATE instance_settings SET value_type = ?, value_bool = ?, value_number = ?, value_string = ?, updated_at = ? WHERE key = ?",
        )
        .bind(&parsed.value_type)
        .bind(parsed.value_bool)
        .bind(parsed.value_number)
        .bind(parsed.value_string.clone())
        .bind(&now)
        .bind(key)
        .execute(conn.as_mut())
        .await
        .map_err(ApiError::from)?;

        row.value_type = parsed.value_type;
        row.value_bool = parsed.value_bool;
        row.value_number = parsed.value_number;
        row.value_string = parsed.value_string;
        row.updated_at = now;
        Ok(row)
    } else {
        let new_row = InstanceSettingsRow {
            key: key.to_string(),
            value_type: parsed.value_type,
            value_bool: parsed.value_bool,
            value_number: parsed.value_number,
            value_string: parsed.value_string,
            created_at: now.clone(),
            updated_at: now.clone(),
        };

        sqlx::query(
            "INSERT INTO instance_settings (key, value_type, value_bool, value_number, value_string, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(&new_row.key)
        .bind(&new_row.value_type)
        .bind(new_row.value_bool)
        .bind(new_row.value_number)
        .bind(new_row.value_string.clone())
        .bind(&new_row.created_at)
        .bind(&new_row.updated_at)
        .execute(conn.as_mut())
        .await
        .map_err(ApiError::from)?;

        Ok(new_row)
    }
}

pub async fn fetch_instance_setting(
    conn: &mut PoolConnection<didhub_db::DbBackend>,
    key: &str,
) -> Result<Option<InstanceSettingsRow>, ApiError> {
    let row = sqlx::query_as::<_, InstanceSettingsRow>(
        "SELECT key, value_type, value_bool, value_number, value_string, created_at, updated_at FROM instance_settings WHERE key = ?",
    )
    .bind(key)
    .fetch_optional(conn.as_mut())
    .await
    .map_err(ApiError::from)?;

    Ok(row)
}
