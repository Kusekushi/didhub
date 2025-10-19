use std::collections::HashMap;
use std::sync::Arc;

use axum::extract::{Extension, Json, Path};
use serde_json::Value;
use sqlx::types::Uuid as SqlxUuid;

use crate::{error::ApiError, state::AppState};
use didhub_db::generated::uploads as db_uploads;

pub async fn delete(
    Extension(state): Extension<Arc<AppState>>,
    headers: axum::http::HeaderMap,
    Path(path): Path<HashMap<String, String>>,
) -> Result<Json<Value>, ApiError> {
    // RBAC: only admin or uploader may delete. Accept Authorization header or session cookie.
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
            "DELETE",
            "/uploads/{id}",
            &path,
            &HashMap::new(),
            &Value::Null,
        )
        .await?;
    let id_str = path
        .get("uploadId")
        .ok_or_else(|| ApiError::not_found("upload id missing"))?
        .to_string();
    let id: SqlxUuid =
        SqlxUuid::parse_str(&id_str).map_err(|_| ApiError::bad_request("invalid uuid"))?;

    let mut conn = state.db_pool.acquire().await.map_err(ApiError::from)?;
    let existing = db_uploads::find_by_primary_key(&mut *conn, &id)
        .await
        .map_err(ApiError::from)?;
    let existing = existing.ok_or_else(|| ApiError::not_found("upload not found"))?;

    let is_admin = auth.scopes.iter().any(|s| s == "admin");
    let is_uploader = auth
        .user_id
        .map(|uid| uid == existing.uploaded_by)
        .unwrap_or(false);
    if existing.uploaded_by == SqlxUuid::nil() && !is_admin {
        return Err(ApiError::Authentication(
            didhub_auth::AuthError::AuthenticationFailed,
        ));
    }
    if !is_admin && !is_uploader {
        return Err(ApiError::Authentication(
            didhub_auth::AuthError::AuthenticationFailed,
        ));
    }

    let affected = db_uploads::delete_by_primary_key(&mut *conn, &id)
        .await
        .map_err(ApiError::from)?;
    if affected == 0 {
        return Err(ApiError::not_found("upload not found"));
    }
    Ok(Json(
        serde_json::to_value(serde_json::json!({ "deleted": true })).map_err(ApiError::from)?,
    ))
}
