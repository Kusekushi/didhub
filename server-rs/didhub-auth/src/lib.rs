use didhub_db::audit;
use didhub_config::AppConfig;
use didhub_db::{Db, NewUser};
use didhub_middleware::types::{CurrentUser, AdminFlag};
use didhub_db::users::UserOperations;
use didhub_error::AppError;
use axum::body::Body;
use axum::extract::FromRef;
use axum::http::{header, HeaderMap, Request};
use axum::{
    extract::{Extension, State},
    http::StatusCode,
    middleware::Next,
    response::{IntoResponse, Response},
    Json,
};
use bcrypt::{hash, verify, DEFAULT_COST};
use jsonwebtoken::{decode, encode, Algorithm, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use tracing::{debug, info, warn};

#[derive(Clone)]
pub struct AuthState {
    pub db: Db,
    pub cfg: AppConfig,
}

impl FromRef<AuthState> for Db {
    fn from_ref(s: &AuthState) -> Db {
        s.db.clone()
    }
}
impl FromRef<AuthState> for AppConfig {
    fn from_ref(s: &AuthState) -> AppConfig {
        s.cfg.clone()
    }
}

#[derive(Serialize, Deserialize)]
struct Claims {
    sub: String,
    exp: usize,
}

// Extract a bearer token from an Authorization header value in a
// case-insensitive manner. Returns trimmed token string when present.
pub fn extract_bearer_token(h: Option<&str>) -> Option<String> {
    let h = h?;
    // Split on whitespace into at most 2 parts: scheme and token
    let mut parts = h.splitn(2, char::is_whitespace);
    let scheme = parts.next()?;
    let token = parts.next()?;
    if scheme.eq_ignore_ascii_case("bearer") && !token.trim().is_empty() {
        Some(token.trim().to_string())
    } else {
        None
    }
}

#[derive(Deserialize)]
pub struct RegisterPayload {
    pub username: String,
    pub password: String,
    pub is_system: Option<bool>,
}

#[derive(Deserialize)]
pub struct LoginPayload {
    pub username: String,
    pub password: String,
}

#[derive(Serialize)]
pub struct AuthResponse {
    pub token: String,
}

#[derive(Serialize)]
pub struct RefreshResponse {
    pub token: String,
    pub refreshed: bool,
}

pub async fn register(
    State(state): State<AuthState>,
    Json(payload): Json<RegisterPayload>,
) -> Result<impl IntoResponse, AppError> {
    debug!(username=%payload.username, is_system=%payload.is_system.unwrap_or(false), "user registration attempt");
    if payload.username.trim().is_empty() || payload.password.is_empty() {
        return Err(AppError::BadRequest(
            "username and password required".into(),
        ));
    }
    if let Some(existing) = state
        .db
        .fetch_user_by_username(&payload.username)
        .await
        .map_err(|_| AppError::Internal)?
    {
        if existing.username == payload.username {
            warn!(username=%payload.username, "registration failed - user already exists");
            return Err(AppError::BadRequest("user exists".into()));
        }
    }
    let password_hash = hash(&payload.password, DEFAULT_COST).map_err(|_| AppError::Internal)?;
    let created = state
        .db
        .create_user(NewUser {
            username: payload.username.clone(),
            password_hash,
            is_system: payload.is_system.unwrap_or(false),
            is_approved: false,
        })
        .await
        .map_err(|e| {
            tracing::error!(
                target = "didhub_server",
                ?e,
                "db.create_user failed in register"
            );
            AppError::Internal
        })?;
    info!(user_id=%created.id, username=%created.username, is_system=%created.is_system != 0, "user registered successfully");
    tracing::debug!(target = "didhub_server", username=%payload.username, jwt_secret_len=%state.cfg.jwt_secret.len(), "about to sign jwt");
    let token = sign_jwt(&state.cfg, &payload.username)?;
    let body_str = serde_json::to_string(&AuthResponse { token }).unwrap();
    let mut resp = Response::new(Body::from(body_str));
    *resp.status_mut() = StatusCode::OK;
    resp.headers_mut()
        .insert("X-Set-CSRF-Rotate", header::HeaderValue::from_static("1"));
    resp.headers_mut().insert(
        header::CONTENT_TYPE,
        header::HeaderValue::from_static("application/json"),
    );
    audit::record_entity(
        &state.db,
        Some(created.id),
        "auth.register",
        "user",
        &created.id.to_string(),
    )
    .await;
    Ok(resp)
}

pub async fn login(
    State(state): State<AuthState>,
    Json(payload): Json<LoginPayload>,
) -> Result<impl IntoResponse, AppError> {
    debug!(username=%payload.username, "login attempt");
    let user_opt = state
        .db
        .fetch_user_by_username(&payload.username)
        .await
        .map_err(|e| {
            tracing::error!(
                target = "didhub_server",
                ?e,
                "db.fetch_user_by_username failed"
            );
            AppError::Internal
        })?;
    let Some(user) = user_opt else {
        warn!(username=%payload.username, "login failed - user not found");
        audit::record_with_metadata(
            &state.db,
            None,
            "auth.login.fail",
            Some("user"),
            None,
            serde_json::json!({"reason":"user_not_found","username": payload.username}),
        )
        .await;
        return Err(AppError::Unauthorized);
    };
    if !verify(&payload.password, &user.password_hash).map_err(|e| {
        tracing::error!(target = "didhub_server", ?e, "bcrypt verify failed");
        AppError::Internal
    })? {
        warn!(user_id=%user.id, username=%user.username, "login failed - bad password");
        audit::record_with_metadata(
            &state.db,
            Some(user.id),
            "auth.login.fail",
            Some("user"),
            Some(&user.id.to_string()),
            serde_json::json!({"reason":"bad_password"}),
        )
        .await;
        return Err(AppError::Unauthorized);
    }
    // Deny login if user is not approved yet
    if user.is_approved == 0 {
        warn!(user_id=%user.id, username=%user.username, "login denied - user not approved");
        audit::record_with_metadata(
            &state.db,
            Some(user.id),
            "auth.login.not_approved",
            Some("user"),
            Some(&user.id.to_string()),
            serde_json::json!({"reason":"not_approved"}),
        )
        .await;
        return Err(AppError::NotApproved);
    }
    let token = sign_jwt(&state.cfg, &user.username)?;
    let body_str = serde_json::to_string(&AuthResponse { token }).unwrap();
    let mut resp = Response::new(Body::from(body_str));
    *resp.status_mut() = StatusCode::OK;
    resp.headers_mut()
        .insert("X-Set-CSRF-Rotate", header::HeaderValue::from_static("1"));
    resp.headers_mut().insert(
        header::CONTENT_TYPE,
        header::HeaderValue::from_static("application/json"),
    );
    info!(user_id=%user.id, username=%user.username, "login successful");
    audit::record_entity(
        &state.db,
        Some(user.id),
        "auth.login.success",
        "user",
        &user.id.to_string(),
    )
    .await;
    Ok(resp)
}

// Issue a new JWT (sliding session) if the supplied token is still valid.
// Client supplies current token via Authorization: Bearer <token> header.
// If token is expired or invalid we return Unauthorized.
pub async fn refresh(
    State(state): State<AuthState>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, AppError> {
    let auth_header = headers
        .get(header::AUTHORIZATION)
        .and_then(|h| h.to_str().ok());
    let Some(raw_token) = extract_bearer_token(auth_header) else {
        return Err(AppError::Unauthorized);
    };
    // Decode existing token first. Reject if invalid or expired.
    let decoded = decode::<Claims>(
        &raw_token,
        &DecodingKey::from_secret(state.cfg.jwt_secret.as_bytes()),
        &Validation::new(Algorithm::HS256),
    )
    .map_err(|_| AppError::Unauthorized)?;
    // Ensure not expired
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as usize;
    if decoded.claims.exp <= now {
        return Err(AppError::Unauthorized);
    }
    // (Optional) Only refresh if remaining time < threshold; currently always refresh to simplify client logic.
    let new_token = sign_jwt(&state.cfg, &decoded.claims.sub)?;
    let body_str = serde_json::to_string(&RefreshResponse {
        token: new_token,
        refreshed: true,
    })
    .unwrap();
    let mut resp = Response::new(Body::from(body_str));
    *resp.status_mut() = StatusCode::OK;
    resp.headers_mut().insert(
        header::CONTENT_TYPE,
        header::HeaderValue::from_static("application/json"),
    );
    Ok(resp)
}

pub fn sign_jwt(cfg: &AppConfig, username: &str) -> Result<String, AppError> {
    use std::time::{SystemTime, UNIX_EPOCH};
    let exp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs()
        + 60 * 60 * 24 * 7; // 7 days
    let claims = Claims {
        sub: username.to_string(),
        exp: exp as usize,
    };
    encode(
        &Header::new(Algorithm::HS256),
        &claims,
        &EncodingKey::from_secret(cfg.jwt_secret.as_bytes()),
    )
    .map_err(|e| {
        tracing::error!(target = "didhub_server", ?e, username = %username, "jwt signing failed");
        AppError::Internal
    })
}

pub const MUST_CHANGE_PASSWORD_ALLOW: &[&str] = &[
    "/api/me",
    "/api/me/password",
    "/api/password-reset/request",
    "/api/password-reset/verify",
    "/api/password-reset/consume",
];

pub async fn auth_middleware(
    State(state): State<AuthState>,
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
    // Load full user; must exist
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
    if is_admin {
        req.extensions_mut().insert(AdminFlag);
    }
    req.extensions_mut().insert(current.clone());
    // Enforce must_change_password: only allow password change and auth endpoints
    if current.must_change_password {
        let path = req.uri().path();
        let ok = MUST_CHANGE_PASSWORD_ALLOW.contains(&path) || path.starts_with("/api/auth");
        if !ok {
            // audit event for enforcement denial
            crate::audit::record_with_metadata(
                &state.db,
                Some(current.id),
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

pub async fn me_handler(
    Extension(user): Extension<CurrentUser>,
) -> Result<impl IntoResponse, AppError> {
    Ok((
        StatusCode::OK,
        Json(serde_json::json!({
            "id": user.id,
            "username": user.username,
            "avatar": user.avatar,
            "is_admin": user.is_admin,
            "is_system": user.is_system,
            "is_approved": user.is_approved,
            "must_change_password": user.must_change_password
        })),
    ))
}

#[derive(Deserialize)]
pub struct ChangePasswordPayload {
    pub current_password: String,
    pub new_password: String,
}

pub async fn change_password(
    State(state): State<AuthState>,
    Extension(user): Extension<CurrentUser>,
    Json(payload): Json<ChangePasswordPayload>,
) -> Result<impl IntoResponse, AppError> {
    if payload.new_password.len() < 6 {
        return Err(AppError::BadRequest("password too short. want at least 6 characters.".into()));
    }
    let db_user = state
        .db
        .fetch_user_by_username(&user.username)
        .await
        .map_err(|_| AppError::Internal)?
        .ok_or(AppError::Unauthorized)?;
    if !verify(&payload.current_password, &db_user.password_hash).map_err(|_| AppError::Internal)? {
        return Err(AppError::Unauthorized);
    }
    let new_hash = hash(&payload.new_password, DEFAULT_COST).map_err(|_| AppError::Internal)?;
    let mut fields = didhub_db::UpdateUserFields::default();
    fields.password_hash = Some(new_hash);
    fields.must_change_password = Some(false);
    let _ = state
        .db
        .update_user(db_user.id, fields)
        .await
        .map_err(|_| AppError::Internal)?;
    crate::audit::record_simple(&state.db, Some(user.id), "user.password.change").await;
    Ok((
        StatusCode::OK,
        Json(serde_json::json!({"ok": true, "must_change_password": false})),
    ))
}

// Placeholder: In the TS server admin status is part of user record; for now treat a special env or username.

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
