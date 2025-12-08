use std::collections::HashMap;
use std::sync::Arc;

use axum::extract::{Extension, Json, Path, Query as AxumQuery};
use serde_json::Value;
use sqlx::types::Uuid as SqlxUuid;

use crate::{error::ApiError, state::AppState};
use didhub_db::generated::uploads as db_uploads;

pub async fn delete(
    Extension(state): Extension<Arc<AppState>>,
    headers: axum::http::HeaderMap,
    Path(path): Path<HashMap<String, String>>,
    query: Option<AxumQuery<HashMap<String, String>>>,
) -> Result<Json<Value>, ApiError> {
    // RBAC: only admin or uploader may delete. For force delete, admin only.
    let auth = match crate::handlers::auth::utils::authenticate_optional(&state, &headers).await? {
        Some(a) => a,
        None => {
            return Err(ApiError::Authentication(
                didhub_auth::AuthError::AuthenticationFailed,
            ))
        }
    };

    let params = query.map(|q| q.0).unwrap_or_default();
    let force = params.get("force").map(|s| s == "1" || s == "true").unwrap_or(false);

    state
        .audit_request(
            "DELETE",
            "/uploads/{id}",
            &path,
            &params,
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
    if force && !is_admin {
        return Err(ApiError::Authentication(
            didhub_auth::AuthError::AuthenticationFailed,
        ));
    }
    if !force && !is_admin && !is_uploader {
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

    if force {
        let stored_file_count: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM uploads WHERE stored_file_id = ?")
                .bind(existing.stored_file_id)
                .fetch_one(&mut *conn)
                .await
                .map_err(ApiError::from)?;

        if stored_file_count == 0 {
            sqlx::query("DELETE FROM stored_files WHERE id = ?")
                .bind(existing.stored_file_id)
                .execute(&mut *conn)
                .await
                .map_err(ApiError::from)?;
        }
    }

    Ok(Json(
        serde_json::to_value(serde_json::json!({ "deleted": true })).map_err(ApiError::from)?,
    ))
}
