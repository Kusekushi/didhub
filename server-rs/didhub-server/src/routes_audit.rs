use anyhow::Result;
use axum::{extract::Query, Extension, Json};
use didhub_db::models::AuditLog;
use didhub_db::{common::CommonOperations, Db};
use didhub_error::AppError;
use didhub_middleware::types::CurrentUser;
use serde::{Deserialize, Serialize};

#[derive(Serialize)]
pub struct AuditLogResponse {
    pub id: i64,
    pub created_at: Option<String>,
    pub user_id: Option<i64>,
    pub action: String,
    pub entity_type: Option<String>,
    pub entity_id: Option<String>,
    pub ip: Option<String>,
    pub metadata: Option<serde_json::Value>,
}

impl From<AuditLog> for AuditLogResponse {
    fn from(a: AuditLog) -> Self {
        let metadata = a
            .metadata
            .and_then(|m| serde_json::from_str(m.as_str()).ok());
        Self {
            id: a.id,
            created_at: a.created_at,
            user_id: a.user_id,
            action: a.action,
            entity_type: a.entity_type,
            entity_id: a.entity_id,
            ip: a.ip,
            metadata,
        }
    }
}

#[derive(Deserialize)]
pub struct ListParams {
    pub action: Option<String>,
    pub user_id: Option<i64>,
    pub from: Option<String>,
    pub to: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

pub async fn list_audit(
    Extension(db): Extension<Db>,
    Extension(user): Extension<CurrentUser>,
    Query(p): Query<ListParams>,
) -> Result<Json<Vec<AuditLogResponse>>, AppError> {
    if !user.is_admin {
        return Err(AppError::Forbidden);
    }
    let limit = p.limit.unwrap_or(100).clamp(1, 500);
    let offset = p.offset.unwrap_or(0).max(0);
    let rows = db
        .list_audit(
            p.action.as_deref(),
            p.user_id,
            p.from.as_deref(),
            p.to.as_deref(),
            limit,
            offset,
        )
        .await
        .map_err(|e| {
            tracing::error!(target = "didhub_server", ?e, "db.list_audit failed");
            AppError::Internal
        })?;
    Ok(Json(rows.into_iter().map(|r| r.into()).collect()))
}

#[derive(Deserialize)]
pub struct PurgeBody {
    pub before: String,
}

pub async fn purge_audit(
    Extension(db): Extension<Db>,
    Extension(user): Extension<CurrentUser>,
    Json(body): Json<PurgeBody>,
) -> Result<Json<serde_json::Value>, AppError> {
    if !user.is_admin {
        return Err(AppError::Forbidden);
    }
    // Expect RFC3339 or sqlite comparable timestamp; we pass directly.
    let deleted = db.purge_audit_before(&body.before).await.map_err(|e| {
        tracing::error!(target = "didhub_server", ?e, "db.purge_audit_before failed");
        AppError::Internal
    })?;
    Ok(Json(serde_json::json!({"deleted": deleted})))
}

pub async fn clear_audit(
    Extension(db): Extension<Db>,
    Extension(user): Extension<CurrentUser>,
) -> Result<Json<serde_json::Value>, AppError> {
    if !user.is_admin {
        return Err(AppError::Forbidden);
    }
    let deleted = db.clear_audit().await.map_err(|e| {
        tracing::error!(target = "didhub_server", ?e, "db.clear_audit failed");
        AppError::Internal
    })?;
    Ok(Json(serde_json::json!({"deleted": deleted})))
}
