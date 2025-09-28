use didhub_db::{groups::GroupOperations, subsystems::SubsystemOperations, Db};
use didhub_error::AppError;
use didhub_middleware::types::CurrentUser;
use tracing::{error, warn};

pub fn parse_leaders(raw: &serde_json::Value) -> Vec<i64> {
    if let Some(arr) = raw.as_array() {
        return arr.iter().filter_map(|v| v.as_i64()).collect();
    }
    if raw.is_string() {
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(raw.as_str().unwrap()) {
            return parse_leaders(&v);
        }
    }
    Vec::new()
}

pub fn require_admin(user: &CurrentUser) -> Result<(), AppError> {
    if !user.is_admin {
        warn!(
            user_id = %user.id,
            username = %user.username,
            "unauthorized admin action"
        );
        return Err(AppError::Forbidden);
    }
    Ok(())
}

pub fn check_ownership_with_existing(user: &CurrentUser, owner_id: Option<i64>) -> Result<(), AppError> {
    if user.is_admin {
        return Ok(());
    }
    let owner = owner_id.unwrap_or(user.id);
    if owner != user.id {
        warn!(
            user_id = %user.id,
            owner_id = %owner,
            "User attempted to access entity without permission"
        );
        return Err(AppError::Forbidden);
    }
    Ok(())
}

pub async fn check_subsystem_ownership(db: &Db, user: &CurrentUser, id: i64) -> Result<(), AppError> {
    if user.is_admin {
        return Ok(());
    }
    if let Some(existing) = db.fetch_subsystem(id).await.map_err(|e| {
        error!(user_id = %user.id, subsystem_id = %id, error = %e, "Failed to fetch subsystem for permission check");
        AppError::Internal
    })? {
        let owner_id = existing.owner_user_id.unwrap_or(user.id);
        if owner_id != user.id {
            warn!(user_id = %user.id, subsystem_id = %id, owner_id = %owner_id, "User attempted to access subsystem without permission");
            return Err(AppError::Forbidden);
        }
    }
    Ok(())
}

pub async fn check_group_ownership(db: &Db, user: &CurrentUser, id: i64) -> Result<(), AppError> {
    if user.is_admin {
        return Ok(());
    }
    if let Some(existing) = db.fetch_group(id).await.map_err(|e| {
        error!(user_id = %user.id, group_id = %id, error = %e, "Failed to fetch group for permission check");
        AppError::Internal
    })? {
        let owner_id = existing.owner_user_id.unwrap_or(user.id);
        if owner_id != user.id {
            warn!(user_id = %user.id, group_id = %id, owner_id = %owner_id, "User attempted to access group without permission");
            return Err(AppError::Forbidden);
        }
    }
    Ok(())
}