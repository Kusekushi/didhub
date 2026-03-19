use std::sync::Arc;

use axum::extract::{Extension, Json};
use axum::http::HeaderMap;
use serde::Deserialize;
use serde_json::{json, Value};
use sqlx::types::Uuid as SqlxUuid;

use crate::error::ApiError;
use crate::handlers::utils::parse_json_array_fields;
use crate::state::AppState;
use didhub_db::generated::subsystems as db_subsystems;
use didhub_db::generated::{affiliations as db_affiliations, relationships as db_relationships};
use didhub_db::generated::{alters as db_alters, users as db_users};

#[derive(Debug, Deserialize)]
#[serde(tag = "action")]
pub enum BulkRequest {
    #[serde(rename = "get")]
    Get {
        #[serde(default)]
        alters: Vec<String>,
        #[serde(default)]
        users: Vec<String>,
        #[serde(default)]
        relationships: Vec<String>,
        #[serde(default)]
        affiliations: Vec<String>,
        #[serde(default)]
        subsystems: Vec<String>,
    },
    #[serde(rename = "set")]
    Set {
        #[serde(default)]
        alters: Vec<serde_json::Value>,
        #[serde(default)]
        users: Vec<serde_json::Value>,
        #[serde(default)]
        relationships: Vec<serde_json::Value>,
        #[serde(default)]
        affiliations: Vec<serde_json::Value>,
        #[serde(default)]
        subsystems: Vec<serde_json::Value>,
    },
    #[serde(rename = "remove")]
    Remove {
        #[serde(default)]
        alters: Vec<String>,
        #[serde(default)]
        users: Vec<String>,
        #[serde(default)]
        relationships: Vec<String>,
        #[serde(default)]
        affiliations: Vec<String>,
        #[serde(default)]
        subsystems: Vec<String>,
    },
}

#[derive(Debug, serde::Serialize)]
pub struct DeletedCounts {
    pub alters: i32,
    pub users: i32,
    pub relationships: i32,
    pub affiliations: i32,
    pub subsystems: i32,
}

pub async fn bulk_operation(
    Extension(state): Extension<Arc<AppState>>,
    headers: HeaderMap,
    body: Option<Json<Value>>,
) -> Result<Json<Value>, ApiError> {
    crate::handlers::auth::utils::authenticate_and_require_approved(&state, &headers).await?;

    let payload_value = body
        .map(|json| json.0)
        .ok_or_else(|| ApiError::bad_request("missing request body"))?;

    let payload: BulkRequest = serde_json::from_value(payload_value).map_err(ApiError::from)?;

    let mut conn = state.db_pool.acquire().await.map_err(ApiError::from)?;

    match payload {
        BulkRequest::Get {
            alters,
            users,
            relationships,
            affiliations,
            subsystems,
        } => {
            let mut response = json!({});

            if !alters.is_empty() {
                let mut alter_results = Vec::new();
                for id_str in &alters {
                    if let Ok(id) = SqlxUuid::parse_str(id_str) {
                        if let Ok(Some(row)) = db_alters::find_by_primary_key(&mut *conn, &id).await
                        {
                            let mut v = serde_json::to_value(&row).map_err(ApiError::from)?;
                            if let Some(obj) = v.as_object_mut() {
                                parse_json_array_fields(obj, &row);
                                if let Some(user_id) = obj.get("user_id").cloned() {
                                    obj.insert("systemId".to_string(), user_id);
                                }
                                if let Ok(parsed) =
                                    serde_json::from_str::<serde_json::Value>(&row.images)
                                {
                                    if let Some(arr) = parsed.as_array() {
                                        if let Some(first) = arr.first() {
                                            if let Some(s) = first.as_str() {
                                                obj.insert(
                                                    "primaryUploadId".to_string(),
                                                    serde_json::Value::String(s.to_string()),
                                                );
                                            }
                                        }
                                    }
                                }
                            }
                            alter_results.push(v);
                        }
                    }
                }
                response
                    .as_object_mut()
                    .unwrap()
                    .insert("alters".to_string(), json!(alter_results));
            }

            if !users.is_empty() {
                let mut user_results = Vec::new();
                for id_str in &users {
                    if let Ok(id) = SqlxUuid::parse_str(id_str) {
                        if let Ok(Some(row)) = db_users::find_by_primary_key(&mut *conn, &id).await
                        {
                            let v = serde_json::to_value(
                                crate::handlers::users::dto::UserPublic::from(row),
                            )
                            .map_err(ApiError::from)?;
                            user_results.push(v);
                        }
                    }
                }
                response
                    .as_object_mut()
                    .unwrap()
                    .insert("users".to_string(), json!(user_results));
            }

            if !relationships.is_empty() {
                let mut rel_results = Vec::new();
                for id_str in &relationships {
                    if let Ok(id) = SqlxUuid::parse_str(id_str) {
                        if let Ok(Some(row)) =
                            db_relationships::find_by_primary_key(&mut *conn, &id).await
                        {
                            let v = serde_json::to_value(&row).map_err(ApiError::from)?;
                            rel_results.push(v);
                        }
                    }
                }
                response
                    .as_object_mut()
                    .unwrap()
                    .insert("relationships".to_string(), json!(rel_results));
            }

            if !affiliations.is_empty() {
                let mut aff_results = Vec::new();
                for id_str in &affiliations {
                    if let Ok(id) = SqlxUuid::parse_str(id_str) {
                        if let Ok(Some(row)) =
                            db_affiliations::find_by_primary_key(&mut *conn, &id).await
                        {
                            let v = serde_json::to_value(&row).map_err(ApiError::from)?;
                            aff_results.push(v);
                        }
                    }
                }
                response
                    .as_object_mut()
                    .unwrap()
                    .insert("affiliations".to_string(), json!(aff_results));
            }

            if !subsystems.is_empty() {
                let mut sub_results = Vec::new();
                for id_str in &subsystems {
                    if let Ok(id) = SqlxUuid::parse_str(id_str) {
                        if let Ok(Some(row)) =
                            db_subsystems::find_by_primary_key(&mut *conn, &id).await
                        {
                            let v = serde_json::to_value(&row).map_err(ApiError::from)?;
                            sub_results.push(v);
                        }
                    }
                }
                response
                    .as_object_mut()
                    .unwrap()
                    .insert("subsystems".to_string(), json!(sub_results));
            }

            Ok(Json(response))
        }
        BulkRequest::Set {
            alters,
            users,
            relationships,
            affiliations,
            subsystems,
        } => {
            let mut response = json!({});

            if !alters.is_empty() {
                let mut alter_results = Vec::new();
                for alter_data in &alters {
                    if let Some(id) = alter_data.get("id").and_then(|v| v.as_str()) {
                        if let Ok(uuid) = SqlxUuid::parse_str(id) {
                            if let Ok(Some(row)) =
                                db_alters::find_by_primary_key(&mut *conn, &uuid).await
                            {
                                alter_results.push(serde_json::to_value(&row).unwrap_or(json!({})));
                            }
                        }
                    }
                }
                response
                    .as_object_mut()
                    .unwrap()
                    .insert("alters".to_string(), json!(alter_results));
            }

            if !users.is_empty() {
                let mut user_results = Vec::new();
                for user_data in &users {
                    if let Some(id) = user_data.get("id").and_then(|v| v.as_str()) {
                        if let Ok(uuid) = SqlxUuid::parse_str(id) {
                            if let Ok(Some(row)) =
                                db_users::find_by_primary_key(&mut *conn, &uuid).await
                            {
                                let v = serde_json::to_value(
                                    crate::handlers::users::dto::UserPublic::from(row),
                                )
                                .unwrap_or(json!({}));
                                user_results.push(v);
                            }
                        }
                    }
                }
                response
                    .as_object_mut()
                    .unwrap()
                    .insert("users".to_string(), json!(user_results));
            }

            if !relationships.is_empty() {
                let mut rel_results = Vec::new();
                for rel_data in &relationships {
                    if let Some(id) = rel_data.get("id").and_then(|v| v.as_str()) {
                        if let Ok(uuid) = SqlxUuid::parse_str(id) {
                            if let Ok(Some(row)) =
                                db_relationships::find_by_primary_key(&mut *conn, &uuid).await
                            {
                                rel_results.push(serde_json::to_value(&row).unwrap_or(json!({})));
                            }
                        }
                    }
                }
                response
                    .as_object_mut()
                    .unwrap()
                    .insert("relationships".to_string(), json!(rel_results));
            }

            if !affiliations.is_empty() {
                let mut aff_results = Vec::new();
                for aff_data in &affiliations {
                    if let Some(id) = aff_data.get("id").and_then(|v| v.as_str()) {
                        if let Ok(uuid) = SqlxUuid::parse_str(id) {
                            if let Ok(Some(row)) =
                                db_affiliations::find_by_primary_key(&mut *conn, &uuid).await
                            {
                                aff_results.push(serde_json::to_value(&row).unwrap_or(json!({})));
                            }
                        }
                    }
                }
                response
                    .as_object_mut()
                    .unwrap()
                    .insert("affiliations".to_string(), json!(aff_results));
            }

            if !subsystems.is_empty() {
                let mut sub_results = Vec::new();
                for sub_data in &subsystems {
                    if let Some(id) = sub_data.get("id").and_then(|v| v.as_str()) {
                        if let Ok(uuid) = SqlxUuid::parse_str(id) {
                            if let Ok(Some(row)) =
                                db_subsystems::find_by_primary_key(&mut *conn, &uuid).await
                            {
                                sub_results.push(serde_json::to_value(&row).unwrap_or(json!({})));
                            }
                        }
                    }
                }
                response
                    .as_object_mut()
                    .unwrap()
                    .insert("subsystems".to_string(), json!(sub_results));
            }

            Ok(Json(response))
        }
        BulkRequest::Remove {
            alters,
            users,
            relationships,
            affiliations,
            subsystems,
        } => {
            let mut deleted = DeletedCounts {
                alters: 0,
                users: 0,
                relationships: 0,
                affiliations: 0,
                subsystems: 0,
            };

            if !alters.is_empty() {
                for id_str in &alters {
                    if let Ok(id) = SqlxUuid::parse_str(id_str) {
                        if db_alters::delete_by_primary_key(&mut *conn, &id)
                            .await
                            .is_ok()
                        {
                            deleted.alters += 1;
                        }
                    }
                }
            }

            if !users.is_empty() {
                for id_str in &users {
                    if let Ok(id) = SqlxUuid::parse_str(id_str) {
                        if db_users::delete_by_primary_key(&mut *conn, &id)
                            .await
                            .is_ok()
                        {
                            deleted.users += 1;
                        }
                    }
                }
            }

            if !relationships.is_empty() {
                for id_str in &relationships {
                    if let Ok(id) = SqlxUuid::parse_str(id_str) {
                        if db_relationships::delete_by_primary_key(&mut *conn, &id)
                            .await
                            .is_ok()
                        {
                            deleted.relationships += 1;
                        }
                    }
                }
            }

            if !affiliations.is_empty() {
                for id_str in &affiliations {
                    if let Ok(id) = SqlxUuid::parse_str(id_str) {
                        if db_affiliations::delete_by_primary_key(&mut *conn, &id)
                            .await
                            .is_ok()
                        {
                            deleted.affiliations += 1;
                        }
                    }
                }
            }

            if !subsystems.is_empty() {
                for id_str in &subsystems {
                    if let Ok(id) = SqlxUuid::parse_str(id_str) {
                        if db_subsystems::delete_by_primary_key(&mut *conn, &id)
                            .await
                            .is_ok()
                        {
                            deleted.subsystems += 1;
                        }
                    }
                }
            }

            Ok(Json(json!({ "deleted": deleted })))
        }
    }
}
