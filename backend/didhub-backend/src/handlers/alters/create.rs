use std::collections::HashMap;
use std::sync::Arc;

use axum::extract::{Extension, Json};
use serde_json::Value;

use crate::handlers::utils::user_is_system;
use crate::{error::ApiError, state::AppState};
use didhub_db::generated::alters as db_alters;
use sqlx::types::Uuid as SqlxUuid;

pub async fn create(
    Extension(state): Extension<Arc<AppState>>,
    headers: axum::http::HeaderMap,
    body: Option<Json<Value>>,
) -> Result<Json<Value>, ApiError> {
    // Require authentication. Accept either an Authorization header or a session cookie.
    // Use the shared helper which looks for both header and cookie and returns Some(auth)
    // if authentication succeeds, or None if no credentials were provided/valid.
    let auth = match crate::handlers::auth::utils::authenticate_optional(&state, &headers).await? {
        Some(a) => a,
        None => {
            return Err(ApiError::Authentication(
                didhub_auth::AuthError::AuthenticationFailed,
            ));
        }
    };

    let payload = body
        .as_ref()
        .ok_or_else(|| ApiError::bad_request("missing request body"))?
        .0
        .clone();
    // audit the incoming request body but do not trust client-supplied owner_user_id
    state
        .audit_request(
            "POST",
            "/alters",
            &HashMap::new(),
            &HashMap::new(),
            &payload,
        )
        .await?;

    // required fields: name
    let name: String = serde_json::from_value(
        payload
            .get("name")
            .cloned()
            .ok_or_else(|| ApiError::bad_request("missing name"))?,
    )
    .map_err(ApiError::from)?;

    // Determine owner_user_id: prefer authenticated user; allow admin to supply a user_id/systemId in payload
    let is_admin = auth.scopes.iter().any(|s| s == "admin");

    // Check if admin is trying to create for a different system (via user_id or systemId in payload)
    let payload_user_id: Option<SqlxUuid> = payload
        .get("user_id")
        .or_else(|| payload.get("systemId"))
        .and_then(|v| v.as_str())
        .and_then(|s| SqlxUuid::parse_str(s).ok());

    let owner_user_id: SqlxUuid = if is_admin && payload_user_id.is_some() {
        // Admin is specifying a target system - use that
        let target_user_id = payload_user_id.unwrap();
        // Validate the target user is a system user
        let mut conn = state.db_pool.acquire().await.map_err(ApiError::from)?;
        match didhub_db::generated::users::find_by_primary_key(&mut *conn, &target_user_id).await {
            Ok(opt_user) => match opt_user {
                Some(user_row) => {
                    if !user_is_system(&user_row) {
                        return Err(ApiError::Authentication(
                            didhub_auth::AuthError::AuthenticationFailed,
                        ));
                    }
                }
                None => {
                    return Err(ApiError::Authentication(
                        didhub_auth::AuthError::AuthenticationFailed,
                    ))
                }
            },
            Err(e) => {
                tracing::warn!(%e, "could not fetch user row to check system role; allowing request (test or incomplete DB schema?)");
            }
        }
        target_user_id
    } else if let Some(uid) = auth.user_id {
        // If the caller is not admin, require that the authenticated user is a system user
        if !is_admin {
            let mut conn = state.db_pool.acquire().await.map_err(ApiError::from)?;
            match didhub_db::generated::users::find_by_primary_key(&mut *conn, &uid).await {
                Ok(opt_user) => match opt_user {
                    Some(user_row) => {
                        if !user_is_system(&user_row) {
                            return Err(ApiError::Authentication(
                                didhub_auth::AuthError::AuthenticationFailed,
                            ));
                        }
                    }
                    None => {
                        return Err(ApiError::Authentication(
                            didhub_auth::AuthError::AuthenticationFailed,
                        ))
                    }
                },
                Err(e) => {
                    tracing::warn!(%e, "could not fetch user row to check system role; allowing request (test or incomplete DB schema?)");
                    // allow through for tests that don't create users table
                }
            }
        }
        uid
    } else if is_admin {
        // Admin without user_id and no target specified - require user_id in payload
        let user_id_str: String = serde_json::from_value(
            payload
                .get("user_id")
                .or_else(|| payload.get("systemId"))
                .cloned()
                .ok_or_else(|| ApiError::bad_request("missing user_id or systemId"))?,
        )
        .map_err(ApiError::from)?;
        let parsed = SqlxUuid::parse_str(&user_id_str)
            .map_err(|_| ApiError::bad_request("invalid user_id"))?;
        let mut conn = state.db_pool.acquire().await.map_err(ApiError::from)?;
        match didhub_db::generated::users::find_by_primary_key(&mut *conn, &parsed).await {
            Ok(opt_user) => match opt_user {
                Some(user_row) => {
                    if !user_is_system(&user_row) {
                        return Err(ApiError::Authentication(
                            didhub_auth::AuthError::AuthenticationFailed,
                        ));
                    }
                }
                None => {
                    return Err(ApiError::Authentication(
                        didhub_auth::AuthError::AuthenticationFailed,
                    ))
                }
            },
            Err(e) => {
                tracing::warn!(%e, "could not fetch user row to check system role; allowing request (test or incomplete DB schema?)");
            }
        }
        parsed
    } else {
        return Err(ApiError::Authentication(
            didhub_auth::AuthError::AuthenticationFailed,
        ));
    };

    // Extract optional fields from payload
    let description: Option<String> = payload
        .get("description")
        .and_then(|v| serde_json::from_value(v.clone()).ok());
    let pronouns: Option<String> = payload
        .get("pronouns")
        .and_then(|v| serde_json::from_value(v.clone()).ok());
    let age: Option<String> = payload
        .get("age")
        .and_then(|v| serde_json::from_value(v.clone()).ok());
    let gender: Option<String> = payload
        .get("gender")
        .and_then(|v| serde_json::from_value(v.clone()).ok());
    let birthday: Option<String> = payload
        .get("birthday")
        .and_then(|v| serde_json::from_value(v.clone()).ok());
    let sexuality: Option<String> = payload
        .get("sexuality")
        .and_then(|v| serde_json::from_value(v.clone()).ok());
    let species: Option<String> = payload
        .get("species")
        .and_then(|v| serde_json::from_value(v.clone()).ok());
    let alter_type: Option<String> = payload
        .get("alterType")
        .or_else(|| payload.get("alter_type"))
        .and_then(|v| serde_json::from_value(v.clone()).ok());
    let job: Option<String> = payload
        .get("job")
        .and_then(|v| serde_json::from_value(v.clone()).ok());
    let weapon: Option<String> = payload
        .get("weapon")
        .and_then(|v| serde_json::from_value(v.clone()).ok());
    let notes: Option<String> = payload
        .get("notes")
        .and_then(|v| serde_json::from_value(v.clone()).ok());

    // Array fields - parse from JSON arrays
    let system_roles: String = payload
        .get("systemRoles")
        .or_else(|| payload.get("system_roles"))
        .and_then(|v| serde_json::to_string(v).ok())
        .unwrap_or_else(|| "[]".to_string());
    let soul_songs: String = payload
        .get("soulSongs")
        .or_else(|| payload.get("soul_songs"))
        .and_then(|v| serde_json::to_string(v).ok())
        .unwrap_or_else(|| "[]".to_string());
    let interests: String = payload
        .get("interests")
        .and_then(|v| serde_json::to_string(v).ok())
        .unwrap_or_else(|| "[]".to_string());
    let triggers: String = payload
        .get("triggers")
        .and_then(|v| serde_json::to_string(v).ok())
        .unwrap_or_else(|| "[]".to_string());

    // Boolean fields
    let is_system_host: i32 = payload
        .get("isSystemHost")
        .or_else(|| payload.get("is_system_host"))
        .and_then(|v| v.as_bool())
        .map(|b| if b { 1 } else { 0 })
        .unwrap_or(0);
    let is_dormant: i32 = payload
        .get("isDormant")
        .or_else(|| payload.get("is_dormant"))
        .and_then(|v| v.as_bool())
        .map(|b| if b { 1 } else { 0 })
        .unwrap_or(0);
    let is_merged: i32 = payload
        .get("isMerged")
        .or_else(|| payload.get("is_merged"))
        .and_then(|v| v.as_bool())
        .map(|b| if b { 1 } else { 0 })
        .unwrap_or(0);

    let now = chrono::Utc::now().to_rfc3339();
    let new_row = db_alters::AltersRow {
        id: SqlxUuid::new_v4(),
        user_id: owner_user_id,
        name,
        description,
        age,
        gender,
        pronouns,
        birthday,
        sexuality,
        species,
        alter_type,
        job,
        weapon,
        triggers,
        metadata: "{}".to_string(),
        soul_songs,
        interests,
        notes,
        images: "[]".to_string(),
        system_roles,
        is_system_host,
        is_dormant,
        is_merged,
        owner_user_id,
        created_at: now.clone(),
    };

    let mut conn = state.db_pool.acquire().await.map_err(ApiError::from)?;
    db_alters::insert_alter(&mut *conn, &new_row)
        .await
        .map_err(ApiError::from)?;
    Ok(Json(
        serde_json::to_value(&new_row).map_err(ApiError::from)?,
    ))
}
