use axum::extract::State;
use axum::http::HeaderMap;
use axum::response::IntoResponse;
use axum::Json;
use didhub_error::AppError;

// Re-export types from didhub_auth crate
use didhub_auth as auth;

/// @api body=json
/// @api response=json
pub async fn register(
    State(state): State<auth::AuthState>,
    Json(payload): Json<auth::handlers::RegisterPayload>,
) -> Result<impl IntoResponse, AppError> {
    auth::handlers::register(State(state), Json(payload)).await
}

/// @api body=json
/// @api response=json
pub async fn login(
    State(state): State<auth::AuthState>,
    Json(payload): Json<auth::handlers::LoginPayload>,
) -> Result<impl IntoResponse, AppError> {
    auth::handlers::login(State(state), Json(payload)).await
}

/// @api response=json
pub async fn refresh(
    State(state): State<auth::AuthState>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, AppError> {
    auth::handlers::refresh(State(state), headers).await
}

/// @api response=json
pub async fn me_handler(
    Extension_user: axum::Extension<didhub_middleware::types::CurrentUser>,
) -> Result<impl IntoResponse, AppError> {
    // Forward to didhub_auth's me handler
    // Note: didhub_auth::handlers::me_handler accepts Extension<CurrentUser>.
    // Use pattern matching compatible with axum handler signatures.
    let ext = Extension_user;
    auth::handlers::me_handler(ext).await
}

/// @api body=json
/// @api response=json
pub async fn change_password(
    State(state): State<auth::AuthState>,
    Extension_user: axum::Extension<didhub_middleware::types::CurrentUser>,
    Json(payload): Json<auth::handlers::ChangePasswordPayload>,
) -> Result<impl IntoResponse, AppError> {
    auth::handlers::change_password(State(state), Extension_user, Json(payload)).await
}
