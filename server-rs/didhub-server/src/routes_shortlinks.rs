use axum::{
    extract::{Extension, Path},
    response::{IntoResponse, Redirect},
    Json,
};
use didhub_db::audit;
use didhub_db::{shortlinks::ShortlinkOperations, Db};
use didhub_error::AppError;
use didhub_middleware::types::CurrentUser;
use serde::Deserialize;
use tracing::{debug, error, info, warn};

#[derive(serde::Serialize)]
pub struct ShortlinkOut {
    pub id: i64,
    pub token: String,
    pub target: String,
}

#[derive(Deserialize)]
pub struct CreateShortlinkPayload {
    pub token: Option<String>,
    pub target: String,
}

fn generate_token() -> String {
    let token = ulid::Ulid::new().to_string()[..8].to_lowercase();
    debug!(generated_token = %token, "Generated new shortlink token");
    token
}

pub async fn create_shortlink(
    Extension(user): Extension<CurrentUser>,
    Extension(db): Extension<Db>,
    Json(payload): Json<CreateShortlinkPayload>,
) -> Result<(axum::http::StatusCode, Json<ShortlinkOut>), AppError> {
    debug!(
        user_id = %user.id,
        username = %user.username,
        target_url = %payload.target,
        custom_token = ?payload.token,
        "Starting shortlink creation"
    );

    if payload.target.trim().is_empty() {
        warn!(
            user_id = %user.id,
            "Shortlink creation failed: empty target URL"
        );
        return Err(AppError::BadRequest("target required".into()));
    }

    let token = if let Some(t) = payload.token {
        if t.trim().is_empty() {
            debug!(user_id = %user.id, "Custom token was empty, generating new token");
            generate_token()
        } else {
            debug!(
                user_id = %user.id,
                custom_token = %t,
                "Using provided custom token"
            );
            t
        }
    } else {
        debug!(user_id = %user.id, "No custom token provided, generating new token");
        generate_token()
    };

    let created = db
        .create_shortlink(&token, &payload.target, Some(user.id))
        .await
        .map_err(|e| {
            error!(
                user_id = %user.id,
                token = %token,
                target = %payload.target,
                error = %e,
                "Failed to create shortlink in database"
            );
            AppError::BadRequest("token already exists?".into())
        })?;

    debug!(
        user_id = %user.id,
        shortlink_id = %created.id,
        token = %created.token,
        target = %created.target,
        "Shortlink created successfully in database"
    );

    audit::record_with_metadata(
        &db,
        Some(user.id),
        "shortlink.create",
        Some("shortlink"),
        Some(&created.id.to_string()),
        serde_json::json!({"token": created.token}),
    )
    .await;

    info!(
        user_id = %user.id,
        shortlink_id = %created.id,
        token = %created.token,
        target = %created.target,
        "Shortlink creation completed successfully"
    );

    Ok((
        axum::http::StatusCode::CREATED,
        Json(ShortlinkOut {
            id: created.id,
            token: created.token,
            target: created.target,
        }),
    ))
}

pub async fn resolve_shortlink(
    Extension(db): Extension<Db>,
    Path(token): Path<String>,
) -> Result<impl IntoResponse, AppError> {
    debug!(token = %token, "Resolving shortlink token");

    let sl = db
        .fetch_shortlink_by_token(&token)
        .await
        .map_err(|e| {
            error!(
                token = %token,
                error = %e,
                "Failed to fetch shortlink from database"
            );
            AppError::Internal
        })?
        .ok_or_else(|| {
            warn!(token = %token, "Shortlink token not found");
            AppError::NotFound
        })?;

    debug!(
        token = %token,
        shortlink_id = %sl.id,
        target = %sl.target,
        "Shortlink resolved successfully"
    );

    Ok(Json(ShortlinkOut {
        id: sl.id,
        token: sl.token,
        target: sl.target,
    }))
}

pub async fn public_redirect(
    Extension(db): Extension<Db>,
    Path(token): Path<String>,
) -> Result<impl IntoResponse, AppError> {
    debug!(token = %token, "Processing public shortlink redirect");

    let sl = db
        .fetch_shortlink_by_token(&token)
        .await
        .map_err(|e| {
            error!(
                token = %token,
                error = %e,
                "Failed to fetch shortlink for redirect"
            );
            AppError::Internal
        })?
        .ok_or_else(|| {
            warn!(token = %token, "Shortlink token not found for redirect");
            AppError::NotFound
        })?;

    info!(
        token = %token,
        shortlink_id = %sl.id,
        target = %sl.target,
        "Redirecting to shortlink target"
    );

    Ok(Redirect::temporary(&sl.target))
}

pub async fn delete_shortlink(
    Extension(user): Extension<CurrentUser>,
    Extension(db): Extension<Db>,
    Path(id): Path<i64>,
) -> Result<Json<serde_json::Value>, AppError> {
    debug!(
        user_id = %user.id,
        username = %user.username,
        shortlink_id = %id,
        is_admin = %user.is_admin,
        "Starting shortlink deletion"
    );

    // Basic admin or owner check: fetch shortlink owner
    let Some(existing) = db.fetch_shortlink_by_id(id).await.map_err(|e| {
        error!(
            user_id = %user.id,
            shortlink_id = %id,
            error = %e,
            "Failed to fetch shortlink for deletion"
        );
        AppError::Internal
    })?
    else {
        warn!(
            user_id = %user.id,
            shortlink_id = %id,
            "Shortlink not found for deletion"
        );
        return Err(AppError::NotFound);
    };

    let owner_id = existing.created_by_user_id.unwrap_or(user.id);
    if !user.is_admin && owner_id != user.id {
        warn!(
            user_id = %user.id,
            shortlink_id = %id,
            owner_id = %owner_id,
            "User attempted to delete shortlink without permission"
        );
        return Err(AppError::Forbidden);
    }

    debug!(
        user_id = %user.id,
        shortlink_id = %id,
        token = %existing.token,
        target = %existing.target,
        "Permission check passed, proceeding with deletion"
    );

    let deleted = db.delete_shortlink(id).await.map_err(|e| {
        error!(
            user_id = %user.id,
            shortlink_id = %id,
            error = %e,
            "Failed to delete shortlink from database"
        );
        AppError::Internal
    })?;

    if !deleted {
        warn!(
            user_id = %user.id,
            shortlink_id = %id,
            "Shortlink deletion returned false (not found)"
        );
        return Err(AppError::NotFound);
    }

    audit::record_entity(
        &db,
        Some(user.id),
        "shortlink.delete",
        "shortlink",
        &id.to_string(),
    )
    .await;

    info!(
        user_id = %user.id,
        shortlink_id = %id,
        token = %existing.token,
        "Shortlink deletion completed successfully"
    );

    Ok(Json(serde_json::json!({"ok": true, "id": id})))
}
