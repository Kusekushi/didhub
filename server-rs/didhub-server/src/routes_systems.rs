use axum::{
    extract::{Extension, Path, Query},
    Json,
};
use didhub_db::models::{SystemDetail, SystemSummary};
use didhub_db::systems::{SystemListFilters, SystemOperations};
use didhub_db::users::UserOperations;
use didhub_db::Db;
use didhub_error::AppError;
use didhub_middleware::types::CurrentUser;
use serde::Deserialize;

#[derive(Deserialize)]
pub struct ListQuery {
    pub q: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[derive(serde::Serialize)]
pub struct Paged<T> {
    pub items: Vec<T>,
    pub total: i64,
    pub limit: i64,
    pub offset: i64,
}

// Basic listing: aggregate by system users (owners that are systems)
pub async fn list_systems(
    Extension(user): Extension<CurrentUser>,
    Extension(db): Extension<Db>,
    Query(q): Query<ListQuery>,
) -> Result<Json<Paged<SystemSummary>>, AppError> {
    if !(user.is_admin || user.is_system) { /* For now allow all; could restrict later */ }
    let limit = q.limit.unwrap_or(50).clamp(1, 200);
    let offset = q.offset.unwrap_or(0).max(0);

    let filters = SystemListFilters { q: q.q };
    let (items, total) = db
        .list_system_users(&filters, limit, offset)
        .await
        .map_err(|_| AppError::Internal)?;

    Ok(Json(Paged {
        items,
        total,
        limit,
        offset,
    }))
}

pub async fn get_system(
    Extension(user): Extension<CurrentUser>,
    Extension(db): Extension<Db>,
    Path(uid): Path<i64>,
) -> Result<Json<SystemDetail>, AppError> {
    // Users can only view their own system unless they are admin
    if !user.is_admin && user.id != uid {
        return Err(AppError::Forbidden);
    }
    let requested_user = db
        .fetch_user_by_id(uid)
        .await
        .map_err(|_| AppError::Internal)?
        .ok_or(AppError::NotFound)?;
    if requested_user.is_system == 0 {
        return Err(AppError::NotFound);
    }

    let detail = db
        .get_system_detail(uid)
        .await
        .map_err(|_| AppError::Internal)?;

    Ok(Json(detail))
}
