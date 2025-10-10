use axum::body::Body;
use axum::http::{header, Request};
use axum::{middleware::Next, response::Response};
use didhub_cache::Cache;
use didhub_db::audit;
use didhub_db::users::UserOperations;
use didhub_error::AppError;
use didhub_middleware::types::{AdminFlag, CurrentUser};
use jsonwebtoken::{decode, Algorithm, DecodingKey, Validation};
use std::time::Duration;

use crate::utils::{extract_bearer_token, Claims};
use crate::AuthState;

pub const MUST_CHANGE_PASSWORD_ALLOW: &[&str] = &[
    "/api/me",
    "/api/me/password",
    "/api/password-reset/request",
    "/api/password-reset/verify",
    "/api/password-reset/consume",
];

pub async fn auth_middleware(
    axum::extract::State(state): axum::extract::State<AuthState>,
    mut req: Request<Body>,
    next: Next,
) -> Result<Response, AppError> {
    // Expect Authorization: Bearer <token>
    let auth_header = req
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|h| h.to_str().ok());
    let token = match extract_bearer_token(auth_header) {
        Some(t) if !t.is_empty() => t,
        _ => return Err(AppError::Unauthorized),
    };
    let decoded = decode::<Claims>(
        &token,
        &DecodingKey::from_secret(state.cfg.jwt_secret.as_bytes()),
        &Validation::new(Algorithm::HS256),
    )
    .map_err(|_| AppError::Unauthorized)?;
    let username = decoded.claims.sub.clone();

    // Try to get user from cache first
    let cache_key = format!("user:{}", username);
    let cached_user: Option<CurrentUser> = state
        .cache
        .get(&cache_key)
        .await
        .map_err(|e| {
            tracing::warn!(username=%username, error=?e, "cache get failed, falling back to DB");
            AppError::Internal
        })
        .unwrap_or(None);

    let current = if let Some(user) = cached_user {
        tracing::debug!(username=%username, "user loaded from cache");
        user
    } else {
        // Load full user from DB; must exist
        let db_user = state
            .db
            .fetch_user_by_username(&username)
            .await
            .map_err(|_| AppError::Unauthorized)?
            .ok_or(AppError::Unauthorized)?;
        let is_admin = db_user.is_admin != 0;
        let current = CurrentUser {
            id: db_user.id,
            username: db_user.username.clone(),
            avatar: db_user.avatar,
            is_admin,
            is_system: db_user.is_system != 0,
            is_approved: db_user.is_approved != 0,
            must_change_password: db_user.must_change_password != 0,
        };
        // Cache the user data for 5 minutes
        if let Err(e) = state
            .cache
            .set(&cache_key, &current, Some(Duration::from_secs(300)))
            .await
        {
            tracing::warn!(username=%username, error=?e, "failed to cache user data");
        }
        tracing::debug!(username=%username, "user loaded from DB and cached");
        current
    };

    if current.is_admin {
        req.extensions_mut().insert(AdminFlag);
    }
    req.extensions_mut().insert(current.clone());
    // Enforce must_change_password: only allow password change and auth endpoints
    if current.must_change_password {
        let path = req.uri().path();
        let ok = MUST_CHANGE_PASSWORD_ALLOW.contains(&path) || path.starts_with("/api/auth");
        if !ok {
            // audit event for enforcement denial
            audit::record_with_metadata(
                &state.db,
                Some(current.id.as_str()),
                "must_change_password.denied",
                Some("route"),
                Some(path),
                serde_json::json!({"path": path}),
            )
            .await;
            return Err(AppError::MustChangePassword);
        }
    }
    Ok(next.run(req).await)
}

pub async fn admin_middleware(req: Request<Body>, next: Next) -> Result<Response, AppError> {
    if req.extensions().get::<AdminFlag>().is_none() {
        tracing::debug!("admin flag missing on request; forbidding");
        return Err(AppError::Forbidden);
    }
    Ok(next.run(req).await)
}

// New guard that depends only on CurrentUser extension (set by auth middleware) instead of AdminFlag ordering.
pub async fn admin_guard_middleware(req: Request<Body>, next: Next) -> Result<Response, AppError> {
    if let Some(cur) = req.extensions().get::<CurrentUser>() {
        if cur.is_admin {
            return Ok(next.run(req).await);
        }
    }
    Err(AppError::Forbidden)
}
