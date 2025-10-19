use std::collections::HashMap;
use std::sync::Arc;

use axum::extract::{Extension, Json, Path};
use axum::http::HeaderMap;
use serde_json::Value;
use sqlx::types::Uuid as SqlxUuid;

use crate::{error::ApiError, state::AppState};
use didhub_db::generated::uploads as db_uploads;

pub async fn force_delete(
    Extension(state): Extension<Arc<AppState>>,
    headers: HeaderMap,
    Path(path): Path<HashMap<String, String>>,
) -> Result<Json<Value>, ApiError> {
    // Admin-only: accept Authorization header or session cookie
    let auth = match crate::handlers::auth::utils::authenticate_optional(&state, &headers).await? {
        Some(a) => a,
        None => {
            return Err(ApiError::Authentication(
                didhub_auth::AuthError::AuthenticationFailed,
            ))
        }
    };
    let is_admin = auth.scopes.iter().any(|s| s == "admin");
    if !is_admin {
        return Err(ApiError::Authentication(
            didhub_auth::AuthError::AuthenticationFailed,
        ));
    }

    state
        .audit_request(
            "DELETE",
            "/uploads/{id}/force",
            &path,
            &HashMap::new(),
            &Value::Null,
        )
        .await?;

    let id_str = path
        .get("uploadId")
        .ok_or_else(|| ApiError::bad_request("missing uploadId"))?
        .to_string();
    let id: SqlxUuid =
        SqlxUuid::parse_str(&id_str).map_err(|_| ApiError::bad_request("invalid uuid"))?;

    let mut conn = state.db_pool.acquire().await.map_err(ApiError::from)?;

    let upload = db_uploads::find_by_primary_key(&mut *conn, &id)
        .await
        .map_err(ApiError::from)?
        .ok_or_else(|| ApiError::not_found("upload not found"))?;

    let affected = db_uploads::delete_by_primary_key(&mut *conn, &id)
        .await
        .map_err(ApiError::from)?;
    if affected == 0 {
        return Err(ApiError::not_found("upload not found"));
    }

    let stored_file_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM uploads WHERE stored_file_id = ?")
            .bind(upload.stored_file_id)
            .fetch_one(&mut *conn)
            .await
            .map_err(ApiError::from)?;

    if stored_file_count == 0 {
        sqlx::query("DELETE FROM stored_files WHERE id = ?")
            .bind(upload.stored_file_id)
            .execute(&mut *conn)
            .await
            .map_err(ApiError::from)?;
    }

    Ok(Json(
        serde_json::to_value(serde_json::json!({ "deleted": true })).map_err(ApiError::from)?,
    ))
}
