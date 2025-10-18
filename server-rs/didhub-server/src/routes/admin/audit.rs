use anyhow::Result;
use axum::{extract::Query, Extension, Json, response::Response};
use didhub_db::models::AuditLog;
use didhub_db::{common::CommonOperations, Db};
use didhub_error::AppError;
use didhub_middleware::types::CurrentUser;
use serde::{Deserialize, Serialize};

#[derive(Serialize)]
pub struct AuditLogResponse {
    pub id: String,
    pub created_at: Option<String>,
    pub user_id: Option<String>,
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
    pub user_id: Option<String>,
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
    if user.is_admin == 0 {
        return Err(AppError::Forbidden);
    }
    let limit = p.limit.unwrap_or(100).clamp(1, 500);
    let offset = p.offset.unwrap_or(0).max(0);
    let rows = db
        .list_audit(
            p.action.as_deref(),
            p.user_id.as_deref(),
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
    if rows.is_empty() {
        return Ok(Json(Vec::new()));
    }
    let mut out = Vec::with_capacity(rows.len());
    for r in rows {
        out.push(r.into());
    }
    Ok(Json(out))
}

#[derive(Deserialize)]
pub struct PurgeBody {
    // optional; when omitted the endpoint will clear all audit rows
    pub before: Option<String>,
}

/// POST /audit/purge
/// If body.before is provided, purge entries before that timestamp.
/// If omitted, clear all audit entries (previously /audit/clear).
/// @api body=json
/// @api response=json
pub async fn purge_audit(
    Extension(db): Extension<Db>,
    Extension(user): Extension<CurrentUser>,
    Json(body): Json<PurgeBody>,
) -> Result<Json<PurgeAuditResponse>, AppError> {
    if user.is_admin == 0 {
        return Err(AppError::Forbidden);
    }
    let deleted = if let Some(before) = body.before {
        // Expect RFC3339 or sqlite comparable timestamp; we pass directly.
        db.purge_audit_before(&before).await.map_err(|e| {
            tracing::error!(target = "didhub_server", ?e, "db.purge_audit_before failed");
            AppError::Internal
        })?
    } else {
        db.clear_audit().await.map_err(|e| {
            tracing::error!(target = "didhub_server", ?e, "db.clear_audit failed");
            AppError::Internal
        })?
    };
    Ok(Json(PurgeAuditResponse { deleted }))
}

/// Internal helper which operates on a CommonOperations trait object. This
/// makes it testable with a mock DB implementation.
pub async fn purge_audit_inner<DB: CommonOperations + Sync>(
    db: &DB,
    user: &CurrentUser,
    body: &PurgeBody,
) -> Result<serde_json::Value, AppError> {
    if user.is_admin == 0 {
        return Err(AppError::Forbidden);
    }
    let deleted = if let Some(ref before) = body.before {
        db.purge_audit_before(before).await.map_err(|e| {
            tracing::error!(target = "didhub_server", ?e, "db.purge_audit_before failed");
            AppError::Internal
        })?
    } else {
        db.clear_audit().await.map_err(|e| {
            tracing::error!(target = "didhub_server", ?e, "db.clear_audit failed");
            AppError::Internal
        })?
    };
    Ok(serde_json::json!({"deleted": deleted}))
}

#[derive(Serialize)]
pub struct PurgeAuditResponse {
    pub deleted: i64,
}

pub async fn export_audit_csv(
    Extension(db): Extension<Db>,
    Extension(user): Extension<CurrentUser>,
    Query(p): Query<ListParams>,
) -> Result<Response, AppError> {
    if user.is_admin == 0 {
        return Err(AppError::Forbidden);
    }

    // For CSV export, we want all matching records, so use a high limit
    let limit = p.limit.unwrap_or(100000).clamp(1, 1000000);
    let offset = p.offset.unwrap_or(0).max(0);

    let rows = db
        .list_audit(
            p.action.as_deref(),
            p.user_id.as_deref(),
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

    // Generate CSV content
    let mut csv_content = String::new();

    // CSV header
    csv_content.push_str("id,created_at,user_id,action,entity_type,entity_id,ip,metadata\n");

    // CSV rows
    for row in rows {
        let metadata_str = row.metadata.unwrap_or_else(|| "null".to_string());
        // Escape quotes and wrap in quotes if contains comma, quote, or newline
        let escape_csv_field = |field: &str| -> String {
            if field.contains(',') || field.contains('"') || field.contains('\n') || field.contains('\r') {
                format!("\"{}\"", field.replace('"', "\"\""))
            } else {
                field.to_string()
            }
        };

        csv_content.push_str(&format!(
            "{},{},{},{},{},{},{},{}\n",
            escape_csv_field(&row.id),
            escape_csv_field(&row.created_at.unwrap_or_default()),
            escape_csv_field(&row.user_id.unwrap_or_default()),
            escape_csv_field(&row.action),
            escape_csv_field(&row.entity_type.unwrap_or_default()),
            escape_csv_field(&row.entity_id.unwrap_or_default()),
            escape_csv_field(&row.ip.unwrap_or_default()),
            escape_csv_field(&metadata_str)
        ));
    }

    // Return CSV response
    let response = Response::builder()
        .header("Content-Type", "text/csv")
        .header("Content-Disposition", "attachment; filename=\"audit_log.csv\"")
        .body(csv_content.into())
        .map_err(|_| AppError::Internal)?;

    Ok(response)
}
