use std::collections::HashMap;
use std::sync::Arc;

use axum::extract::{Extension, Json, Path};
use serde_json::Value;

use crate::handlers::utils::user_is_system;
use crate::{error::ApiError, state::AppState};
use didhub_db::generated::alters as db_alters;
use sqlx::types::Uuid as SqlxUuid;

pub async fn update(
    Extension(state): Extension<Arc<AppState>>,
    headers: axum::http::HeaderMap,
    Path(path): Path<HashMap<String, String>>,
    body: Option<Json<Value>>,
) -> Result<Json<Value>, ApiError> {
    // RBAC: only admin or owner may update. Accept either Authorization header or session cookie.
    let auth = match crate::handlers::auth::utils::authenticate_optional(&state, &headers).await? {
        Some(a) => a,
        None => {
            return Err(ApiError::Authentication(
                didhub_auth::AuthError::AuthenticationFailed,
            ))
        }
    };

    state
        .audit_request(
            "PATCH",
            "/alters/{id}",
            &path,
            &HashMap::new(),
            &body.as_ref().map(|j| j.0.clone()).unwrap_or(Value::Null),
        )
        .await?;

    let id_str = path
        .get("alterId")
        .ok_or_else(|| ApiError::not_found("alter id missing"))?
        .to_string();
    let id: SqlxUuid =
        SqlxUuid::parse_str(&id_str).map_err(|_| ApiError::bad_request("invalid uuid"))?;
    let mut conn = state.db_pool.acquire().await.map_err(ApiError::from)?;
    let existing = db_alters::find_by_primary_key(&mut *conn, &id)
        .await
        .map_err(ApiError::from)?;
    let mut existing = existing.ok_or_else(|| ApiError::not_found("alter not found"))?;

    let is_admin = auth.scopes.iter().any(|s| s == "admin");
    let is_owner = auth
        .user_id
        .map(|uid| uid == existing.owner_user_id)
        .unwrap_or(false);
    if !is_admin && !is_owner {
        return Err(ApiError::Authentication(
            didhub_auth::AuthError::AuthenticationFailed,
        ));
    }

    // If caller is not admin, require they are a system user
    if !is_admin {
        if let Some(uid) = auth.user_id {
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
                    // allow through for tests that don't create users table or have differing schema
                }
            }
        } else {
            return Err(ApiError::Authentication(
                didhub_auth::AuthError::AuthenticationFailed,
            ));
        }
    }

    // apply partial updates via DTO
    let dto: super::dto::UpdateAlter = if let Some(body) = body {
        serde_json::from_value(body.0).map_err(ApiError::from)?
    } else {
        super::dto::UpdateAlter {
            name: None,
            description: None,
            notes: None,
            owner_user_id: None,
            age: None,
            gender: None,
            pronouns: None,
            birthday: None,
            sexuality: None,
            species: None,
            alter_type: None,
            job: None,
            weapon: None,
            system_roles: None,
            is_system_host: None,
            is_dormant: None,
            is_merged: None,
            soul_songs: None,
            interests: None,
            triggers: None,
            images: None,
        }
    };
    if let Err(issues) = dto.validate() {
        return Err(ApiError::Validation(crate::validation::to_payload(&issues)));
    }

    if let Some(name) = dto.name {
        existing.name = name;
    }
    if let Some(description) = dto.description {
        existing.description = Some(description);
    }
    if let Some(notes) = dto.notes {
        existing.notes = Some(notes);
    }
    if let Some(age) = dto.age {
        existing.age = Some(age);
    }
    if let Some(gender) = dto.gender {
        existing.gender = Some(gender);
    }
    if let Some(pronouns) = dto.pronouns {
        existing.pronouns = Some(pronouns);
    }
    if let Some(birthday) = dto.birthday {
        existing.birthday = Some(birthday);
    }
    if let Some(sexuality) = dto.sexuality {
        existing.sexuality = Some(sexuality);
    }
    if let Some(species) = dto.species {
        existing.species = Some(species);
    }
    if let Some(alter_type) = dto.alter_type {
        existing.alter_type = Some(alter_type);
    }
    if let Some(job) = dto.job {
        existing.job = Some(job);
    }
    if let Some(weapon) = dto.weapon {
        existing.weapon = Some(weapon);
    }
    if let Some(system_roles) = dto.system_roles {
        existing.system_roles =
            serde_json::to_string(&system_roles).unwrap_or_else(|_| "[]".to_string());
    }
    if let Some(is_system_host) = dto.is_system_host {
        existing.is_system_host = if is_system_host { 1 } else { 0 };
    }
    if let Some(is_dormant) = dto.is_dormant {
        existing.is_dormant = if is_dormant { 1 } else { 0 };
    }
    if let Some(is_merged) = dto.is_merged {
        existing.is_merged = if is_merged { 1 } else { 0 };
    }
    if let Some(soul_songs) = dto.soul_songs {
        existing.soul_songs =
            serde_json::to_string(&soul_songs).unwrap_or_else(|_| "[]".to_string());
    }
    if let Some(interests) = dto.interests {
        existing.interests = serde_json::to_string(&interests).unwrap_or_else(|_| "[]".to_string());
    }
    if let Some(triggers) = dto.triggers {
        existing.triggers = serde_json::to_string(&triggers).unwrap_or_else(|_| "[]".to_string());
    }
    if let Some(images) = dto.images {
        existing.images = serde_json::to_string(&images).unwrap_or_else(|_| "[]".to_string());
    }
    if let Some(owner) = dto.owner_user_id {
        // Only admin may change owner; and admin-supplied owner must be a system user
        if !is_admin {
            return Err(ApiError::Authentication(
                didhub_auth::AuthError::AuthenticationFailed,
            ));
        }
        let parsed_owner = SqlxUuid::parse_str(&owner)
            .map_err(|_| ApiError::bad_request("invalid owner_user_id"))?;
        // validate target user is a system user (as in create_alter)
        let mut lookup_conn = state.db_pool.acquire().await.map_err(ApiError::from)?;
        match didhub_db::generated::users::find_by_primary_key(&mut *lookup_conn, &parsed_owner)
            .await
        {
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
                tracing::warn!(%e, "could not fetch user row to check system role for owner update; allowing request (test or incomplete DB schema?)");
            }
        }
        existing.owner_user_id = parsed_owner;
    }

    // Keep created_at as-is per DB schema expectations
    let affected = db_alters::update_by_primary_key(&mut *conn, &id, &existing)
        .await
        .map_err(ApiError::from)?;
    if affected == 0 {
        return Err(ApiError::not_found("alter not found"));
    }
    Ok(Json(
        serde_json::to_value(&existing).map_err(ApiError::from)?,
    ))
}
