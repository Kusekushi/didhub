use didhub_db::{settings::SettingOperations, Db};
use didhub_error::AppError;
use didhub_db::audit;
use crate::{settings, upload_dir};
use didhub_middleware::types::CurrentUser;
use anyhow::Result;
use axum::{extract::Path, Extension, Json};
use serde::{Deserialize, Serialize};
use tracing::{debug, info, warn};

#[derive(Serialize)]
pub struct SettingResponse {
    pub key: String,
    pub value: serde_json::Value,
    pub updated_at: Option<String>,
}

impl From<didhub_db::Setting> for SettingResponse {
    fn from(s: didhub_db::Setting) -> Self {
        let parsed = serde_json::from_str(&s.value).unwrap_or(serde_json::Value::String(s.value));
        Self {
            key: s.key,
            value: parsed,
            updated_at: s.updated_at,
        }
    }
}

#[derive(Deserialize)]
pub struct UpsertBody {
    pub value: serde_json::Value,
}

pub async fn list_settings(
    Extension(db): Extension<Db>,
    Extension(user): Extension<CurrentUser>,
) -> Result<Json<Vec<SettingResponse>>, AppError> {
    if !user.is_admin {
        warn!(user_id=%user.id, username=%user.username, "unauthorized attempt to list settings");
        return Err(AppError::Forbidden);
    }
    debug!(user_id=%user.id, "listing all settings");
    let rows = db.list_settings().await.map_err(|_| AppError::Internal)?;

    // Map old discord.webhook key to new discord_webhook_url key for frontend compatibility
    let mut mapped_rows = Vec::new();
    for row in rows {
        if row.key == "discord.webhook" {
            // Create a new SettingResponse with the mapped key
            let parsed =
                serde_json::from_str(&row.value).unwrap_or(serde_json::Value::String(row.value));
            mapped_rows.push(SettingResponse {
                key: "discord_webhook_url".to_string(),
                value: parsed,
                updated_at: row.updated_at,
            });
        } else {
            mapped_rows.push(row.into());
        }
    }

    debug!(user_id=%user.id, settings_count=%mapped_rows.len(), "settings listed");
    Ok(Json(mapped_rows))
}

pub async fn get_setting(
    Extension(db): Extension<Db>,
    Extension(user): Extension<CurrentUser>,
    Path(key): Path<String>,
) -> Result<Json<Option<SettingResponse>>, AppError> {
    if !user.is_admin {
        warn!(user_id=%user.id, username=%user.username, setting_key=%key, "unauthorized attempt to get setting");
        return Err(AppError::Forbidden);
    }
    debug!(user_id=%user.id, setting_key=%key, "getting setting");

    // Handle key mapping for backward compatibility
    let db_key = if key == "discord_webhook_url" {
        "discord.webhook"
    } else {
        &key
    };

    let rec = db
        .get_setting(db_key)
        .await
        .map_err(|_| AppError::Internal)?;

    // If found with old key, return with new key
    let response = if rec.is_some() && db_key != key {
        let r = rec.unwrap();
        let parsed = serde_json::from_str(&r.value).unwrap_or(serde_json::Value::String(r.value));
        Some(SettingResponse {
            key: key.clone(),
            value: parsed,
            updated_at: r.updated_at,
        })
    } else {
        rec.map(|r| r.into())
    };

    debug!(user_id=%user.id, setting_key=%key, found=%response.is_some(), "setting retrieved");
    Ok(Json(response))
}

pub async fn upsert_setting(
    Extension(db): Extension<Db>,
    Extension(user): Extension<CurrentUser>,
    Path(key): Path<String>,
    Json(body): Json<UpsertBody>,
) -> Result<Json<SettingResponse>, AppError> {
    if !user.is_admin {
        warn!(user_id=%user.id, username=%user.username, setting_key=%key, "unauthorized attempt to update setting");
        return Err(AppError::Forbidden);
    }
    debug!(user_id=%user.id, setting_key=%key, new_value=?body.value, "updating setting");
    if let Err(problems) = settings::validate_setting(&key, &body.value) {
        warn!(user_id=%user.id, setting_key=%key, validation_errors=?problems, "setting validation failed");
        return Err(AppError::validation(problems));
    }

    // Handle key mapping for backward compatibility
    let db_key = if key == "discord_webhook_url" {
        "discord.webhook"
    } else {
        &key
    };

    let serialized =
        serde_json::to_string(&body.value).map_err(|e| AppError::BadRequest(e.to_string()))?;
    let rec = db
        .upsert_setting(db_key, &serialized)
        .await
        .map_err(|_| AppError::Internal)?;

    // Return with the requested key (not the stored key)
    let response = if db_key != key {
        let parsed =
            serde_json::from_str(&rec.value).unwrap_or(serde_json::Value::String(rec.value));
        SettingResponse {
            key: key.clone(),
            value: parsed,
            updated_at: rec.updated_at,
        }
    } else {
        rec.into()
    };

    // Fire and forget audit
    audit::record_settings_update(&db, Some(user.id), &key).await;
    debug!(user_id=%user.id, setting_key=%key, "setting updated");
    if key == "app.upload_dir" {
        if let Some(g) = upload_dir::global() {
            g.invalidate().await;
        }
    }
    info!(user_id=%user.id, setting_key=%key, "setting updated successfully");
    Ok(Json(response))
}

pub async fn bulk_upsert_settings(
    Extension(db): Extension<Db>,
    Extension(user): Extension<CurrentUser>,
    Json(payload): Json<serde_json::Value>,
) -> Result<Json<Vec<SettingResponse>>, AppError> {
    if !user.is_admin {
        warn!(user_id=%user.id, username=%user.username, "unauthorized attempt to bulk update settings");
        return Err(AppError::Forbidden);
    }

    let settings_map = payload
        .as_object()
        .ok_or_else(|| AppError::BadRequest("Expected JSON object".to_string()))?;

    let mut results = Vec::new();

    for (key, value) in settings_map {
        debug!(user_id=%user.id, setting_key=%key, new_value=?value, "bulk updating setting");

        // Validate the setting
        if let Err(problems) = settings::validate_setting(key, value) {
            warn!(user_id=%user.id, setting_key=%key, validation_errors=?problems, "setting validation failed in bulk update");
            return Err(AppError::validation(problems));
        }

        // Serialize the value
        let serialized =
            serde_json::to_string(value).map_err(|e| AppError::BadRequest(e.to_string()))?;

        // Update the setting
        let rec = db
            .upsert_setting(key, &serialized)
            .await
            .map_err(|_| AppError::Internal)?;

        results.push(rec.into());

        // Handle special cases
        if key == "app.upload_dir" {
            if let Some(g) = upload_dir::global() {
                g.invalidate().await;
            }
        }
    }

    // Fire and forget audit for all updates
    audit::record_settings_update(&db, Some(user.id), "bulk_update").await;

    info!(user_id=%user.id, settings_count=%results.len(), "bulk settings update completed successfully");
    Ok(Json(results))
}
