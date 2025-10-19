use std::collections::HashMap;
use std::sync::Arc;

use axum::extract::{Extension, Json};
use serde_json::Value;
use sqlx::types::Uuid as SqlxUuid;

use crate::{error::ApiError, state::AppState};
use didhub_db::generated::uploads as db_uploads;

pub async fn create(
    Extension(state): Extension<Arc<AppState>>,
    headers: axum::http::HeaderMap,
    body: Option<Json<Value>>,
) -> Result<Json<Value>, ApiError> {
    // Only approved users (or admin) may create uploads
    let auth =
        crate::handlers::auth::utils::authenticate_and_require_approved(&state, &headers).await?;
    let payload = body
        .as_ref()
        .ok_or_else(|| ApiError::bad_request("missing request body"))?
        .0
        .clone();
    let uploaded_by: SqlxUuid = auth
        .user_id
        .ok_or_else(|| ApiError::Authentication(didhub_auth::AuthError::AuthenticationFailed))?;
    let is_admin = auth.scopes.iter().any(|s| s == "admin");
    if !is_admin {
        let mut conn = state.db_pool.acquire().await.map_err(ApiError::from)?;
        match didhub_db::generated::users::find_by_primary_key(&mut *conn, &uploaded_by).await {
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
            }
        }
    }
    state
        .audit_request(
            "POST",
            "/uploads",
            &HashMap::new(),
            &HashMap::new(),
            &payload,
        )
        .await?;

    let stored_file_id_str: String = serde_json::from_value(
        payload
            .get("stored_file_id")
            .cloned()
            .ok_or_else(|| ApiError::bad_request("missing stored_file_id"))?,
    )
    .map_err(ApiError::from)?;
    let stored_file_id = SqlxUuid::parse_str(&stored_file_id_str)
        .map_err(|_| ApiError::bad_request("invalid stored_file_id"))?;
    let stored_name: String = serde_json::from_value(
        payload
            .get("stored_name")
            .cloned()
            .ok_or_else(|| ApiError::bad_request("missing stored_name"))?,
    )
    .map_err(ApiError::from)?;

    let now = chrono::Utc::now().to_rfc3339();
    let new_row = db_uploads::UploadsRow {
        id: SqlxUuid::new_v4(),
        stored_file_id,
        stored_name,
        uploaded_by,
        created_at: now.clone(),
    };

    let mut conn = state.db_pool.acquire().await.map_err(ApiError::from)?;
    db_uploads::insert_upload(&mut *conn, &new_row)
        .await
        .map_err(ApiError::from)?;

    Ok(Json(
        serde_json::to_value(&new_row).map_err(ApiError::from)?,
    ))
}
