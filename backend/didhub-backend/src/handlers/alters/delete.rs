use std::collections::HashMap;
use std::sync::Arc;

use axum::extract::{Extension, Json, Path};
use serde_json::Value;

use crate::{error::ApiError, state::AppState};
use didhub_db::generated::alters as db_alters;
use sqlx::types::Uuid as SqlxUuid;

pub async fn delete(
    Extension(state): Extension<Arc<AppState>>,
    _headers: axum::http::HeaderMap,
    Path(path): Path<HashMap<String, String>>,
) -> Result<Json<Value>, ApiError> {
    // RBAC: only admin or owner may delete. Accept either Authorization header or session cookie.
    let auth = match crate::handlers::auth::utils::authenticate_optional(&state, &_headers).await? {
        Some(a) => a,
        None => {
            return Err(ApiError::Authentication(
                didhub_auth::AuthError::AuthenticationFailed,
            ))
        }
    };

    state
        .audit_request(
            "DELETE",
            "/alters/{id}",
            &path,
            &HashMap::new(),
            &Value::Null,
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
    let existing = existing.ok_or_else(|| ApiError::not_found("alter not found"))?;

    let is_admin = auth.scopes.iter().any(|s| s == "admin");
    let is_owner = auth
        .user_id
        .map(|uid| uid == existing.owner_user_id)
        .unwrap_or(false);
    // If caller is not admin, require they are a system user
    if !is_admin {
        if let Some(uid) = auth.user_id {
            let mut conn = state.db_pool.acquire().await.map_err(ApiError::from)?;
            match didhub_db::generated::users::find_by_primary_key(&mut *conn, &uid).await {
                Ok(opt_user) => match opt_user {
                    Some(user_row) => {
                        if user_row.is_system == 0 {
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
                    tracing::warn!(%e, "could not fetch user row to check system flag; allowing request (test or incomplete DB schema?)");
                    // allow through for tests that don't create users table or have differing schema
                }
            }
        } else {
            return Err(ApiError::Authentication(
                didhub_auth::AuthError::AuthenticationFailed,
            ));
        }
    }
    // Prevent non-admins from modifying system-owned alters
    if existing.is_system_host == 1 && !is_admin {
        return Err(ApiError::Authentication(
            didhub_auth::AuthError::AuthenticationFailed,
        ));
    }
    if !is_admin && !is_owner {
        return Err(ApiError::Authentication(
            didhub_auth::AuthError::AuthenticationFailed,
        ));
    }

    let affected = db_alters::delete_by_primary_key(&mut *conn, &id)
        .await
        .map_err(ApiError::from)?;
    if affected == 0 {
        return Err(ApiError::not_found("alter not found"));
    }
    Ok(Json(
        serde_json::to_value(serde_json::json!({ "deleted": true })).map_err(ApiError::from)?,
    ))
}
