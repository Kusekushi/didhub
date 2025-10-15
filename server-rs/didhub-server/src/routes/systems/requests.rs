use axum::{extract::Query, Extension, Json};
use didhub_db::audit;
use didhub_db::system_requests::SystemRequestOperations;
use didhub_db::Db;
use didhub_error::AppError;
use didhub_middleware::types::CurrentUser;
use serde::{Deserialize, Serialize};
use tracing::{debug, error, info, warn};

#[derive(Serialize)]
pub struct SystemRequestResponse {
    pub id: String,
    pub status: String,
    pub note: Option<String>,
    pub decided_at: Option<String>,
    pub created_at: Option<String>,
}

#[derive(Serialize)]
pub struct SystemRequestAdminResponse {
    pub id: String,
    pub user_id: String,
    pub username: String,
    pub status: String,
    pub note: Option<String>,
    pub decided_at: Option<String>,
    pub created_at: Option<String>,
}

impl From<didhub_db::SystemRequest> for SystemRequestResponse {
    fn from(v: didhub_db::SystemRequest) -> Self {
        Self {
            id: v.id,
            status: v.status,
            note: v.note,
            decided_at: v.decided_at,
            created_at: v.created_at,
        }
    }
}

impl From<didhub_db::SystemRequestAdmin> for SystemRequestAdminResponse {
    fn from(v: didhub_db::SystemRequestAdmin) -> Self {
        Self {
            id: v.id,
            user_id: v.user_id,
            username: v.username,
            status: v.status,
            note: v.note,
            decided_at: v.decided_at,
            created_at: v.created_at,
        }
    }
}

#[derive(Deserialize)]
pub struct ListParams {
    pub status: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

pub async fn request_system(
    Extension(db): Extension<Db>,
    Extension(user): Extension<CurrentUser>,
) -> Result<Json<SystemRequestResponse>, AppError> {
    debug!(
        user_id = %user.id,
        username = %user.username,
        is_system = %user.is_system,
        "Starting system request creation"
    );

    if user.is_system == 1 {
        warn!(
            user_id = %user.id,
            "User attempted to create system request but is already a system"
        );
        return Err(AppError::BadRequest("already a system".into()));
    }

    let rec = db.create_system_request(&user.id).await.map_err(|e| {
        error!(
            user_id = %user.id,
            error = %e,
            "Failed to create system request in database"
        );
        AppError::Internal
    })?;

    debug!(
        user_id = %user.id,
        request_id = %rec.id,
        status = %rec.status,
        "System request created successfully in database"
    );

    let ip_arc = didhub_middleware::client_ip::get_request_ip();
    let ip = ip_arc.as_ref().map(|s| s.as_str());
    audit::record_with_metadata(
        &db,
        Some(user.id.as_str()),
        "system_request.create",
        Some("system_request"),
        Some(&rec.id.to_string()),
        serde_json::json!({"status": rec.status}),
        ip,
    )
    .await;

    info!(
        user_id = %user.id,
        request_id = %rec.id,
        "System request creation completed successfully"
    );

    Ok(Json(rec.into()))
}

pub async fn my_system_request(
    Extension(db): Extension<Db>,
    Extension(user): Extension<CurrentUser>,
) -> Result<Json<Option<SystemRequestResponse>>, AppError> {
    debug!(
        user_id = %user.id,
        username = %user.username,
        "Fetching user's latest system request"
    );

    let rec = db
        .fetch_latest_system_request_for_user(&user.id)
        .await
        .map_err(|e| {
            error!(
                user_id = %user.id,
                error = %e,
                "Failed to fetch user's latest system request"
            );
            AppError::Internal
        })?;

    if let Some(ref request) = rec {
        debug!(
            user_id = %user.id,
            request_id = %request.id,
            status = %request.status,
            has_note = request.note.is_some(),
            decided_at = ?request.decided_at,
            "User's latest system request found"
        );
    } else {
        debug!(
            user_id = %user.id,
            "No system request found for user"
        );
    }

    Ok(Json(rec.map(|r| r.into())))
}

pub async fn list_system_requests(
    Extension(db): Extension<Db>,
    Extension(user): Extension<CurrentUser>,
    Query(p): Query<ListParams>,
) -> Result<Json<Vec<SystemRequestAdminResponse>>, AppError> {
    debug!(
        user_id = %user.id,
        username = %user.username,
        is_admin = %user.is_admin,
        status_filter = ?p.status,
        limit = ?p.limit,
        offset = ?p.offset,
        "Listing system requests"
    );

    if user.is_admin == 0 {
        warn!(
            user_id = %user.id,
            "Non-admin user attempted to list system requests"
        );
        return Err(AppError::Forbidden);
    }

    let limit = p.limit.unwrap_or(50).clamp(1, 200);
    let offset = p.offset.unwrap_or(0).max(0);

    let rows = db
        .list_system_requests_admin(p.status.as_deref(), limit, offset)
        .await
        .map_err(|e| {
            error!(
                user_id = %user.id,
                error = %e,
                status_filter = ?p.status,
                limit = limit,
                offset = offset,
                "Failed to list system requests"
            );
            AppError::Internal
        })?;

    debug!(
        user_id = %user.id,
        returned_count = rows.len(),
        status_filter = ?p.status,
        limit = limit,
        offset = offset,
        "System requests listed successfully"
    );

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
pub struct DecisionBody {
    pub id: Option<String>,
    pub approve: bool,
    pub note: Option<String>,
}

pub async fn decide_system_request(
    Extension(db): Extension<Db>,
    Extension(user): Extension<CurrentUser>,
    Json(body): Json<DecisionBody>,
) -> Result<Json<SystemRequestResponse>, AppError> {
    let id = if let Some(ref i) = body.id {
        i.clone()
    } else {
        return Err(AppError::BadRequest("missing id".into()));
    };

    debug!(
        user_id = %user.id,
        username = %user.username,
        is_admin = %user.is_admin,
        request_id = %id,
        approve = %body.approve,
        has_note = body.note.is_some(),
        "Starting system request decision"
    );

    if user.is_admin == 0 {
        warn!(
            user_id = %user.id,
            request_id = %id,
            "Non-admin user attempted to decide system request"
        );
        return Err(AppError::Forbidden);
    }

    let updated = db
        .decide_system_request(&id, body.approve, body.note.as_deref())
        .await
        .map_err(|e| {
            error!(
                user_id = %user.id,
                request_id = %id,
                approve = %body.approve,
                error = %e,
                "Failed to decide system request in database"
            );
            AppError::Internal
        })?;

    if let Some(ref v) = updated {
        let action = if body.approve {
            "system_request.approve"
        } else {
            "system_request.deny"
        };

        debug!(
            user_id = %user.id,
            request_id = %v.id,
            action = action,
            new_status = %v.status,
            has_note = v.note.is_some(),
            "System request decision applied successfully"
        );

        let ip_arc = didhub_middleware::client_ip::get_request_ip();
        let ip = ip_arc.as_ref().map(|s| s.as_str());
        audit::record_with_metadata(
            &db,
            Some(user.id.as_str()),
            action,
            Some("system_request"),
            Some(&v.id.to_string()),
            serde_json::json!({"status": v.status, "note": v.note}),
            ip,
        )
        .await;

        info!(
            user_id = %user.id,
            request_id = %v.id,
            action = action,
            "System request decision completed successfully"
        );

        Ok(Json(v.clone().into()))
    } else {
        warn!(
            user_id = %user.id,
            request_id = %id,
            "System request not found for decision"
        );
        Err(AppError::NotFound)
    }
}
