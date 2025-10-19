use std::collections::HashMap;
use std::sync::Arc;

use axum::extract::{Extension, Json, Path};
use serde_json::Value;
use sqlx::types::Uuid as SqlxUuid;

use crate::{error::ApiError, state::AppState};
use didhub_db::generated::relationships as db_rels;

pub async fn delete(
    Extension(state): Extension<Arc<AppState>>,
    _headers: axum::http::HeaderMap,
    Path(path): Path<HashMap<String, String>>,
) -> Result<Json<Value>, ApiError> {
    // RBAC: only admin or creator may delete. Accept Authorization header or session cookie.
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
            "/relationships/{id}",
            &path,
            &HashMap::new(),
            &Value::Null,
        )
        .await?;
    let id_str = path
        .get("relationshipId")
        .ok_or_else(|| ApiError::not_found("relationship id missing"))?
        .to_string();
    let id: SqlxUuid =
        SqlxUuid::parse_str(&id_str).map_err(|_| ApiError::bad_request("invalid uuid"))?;
    let mut conn = state.db_pool.acquire().await.map_err(ApiError::from)?;

    let existing = db_rels::find_by_primary_key(&mut *conn, &id)
        .await
        .map_err(ApiError::from)?;
    let existing = existing.ok_or_else(|| ApiError::not_found("relationship not found"))?;

    let is_admin = auth.scopes.iter().any(|s| s == "admin");
    let is_creator = auth
        .user_id
        .map(|uid| existing.created_by.map(|cb| cb == uid).unwrap_or(false))
        .unwrap_or(false);
    if !is_admin && !is_creator {
        return Err(ApiError::Authentication(
            didhub_auth::AuthError::AuthenticationFailed,
        ));
    }

    let affected = db_rels::delete_by_primary_key(&mut *conn, &id)
        .await
        .map_err(ApiError::from)?;
    if affected == 0 {
        return Err(ApiError::not_found("relationship not found"));
    }
    Ok(Json(
        serde_json::to_value(serde_json::json!({ "deleted": true })).map_err(ApiError::from)?,
    ))
}
