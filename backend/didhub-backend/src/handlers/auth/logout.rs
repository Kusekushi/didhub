use std::sync::Arc;

use axum::extract::Extension;
use axum::http::{header::SET_COOKIE, StatusCode};
use axum::response::{IntoResponse, Json};
use serde_json::json;

use crate::state::AppState;

/// POST /auth/logout
/// Clear cookie by setting expired Set-Cookie
pub async fn logout(Extension(_state): Extension<Arc<AppState>>) -> impl IntoResponse {
    // Clear cookie by emitting a Set-Cookie header with Max-Age=0
    let cookie_str = "didhub_session=; Path=/; HttpOnly; Max-Age=0; SameSite=Lax";
    let mut resp = (StatusCode::OK, Json(json!({ "ok": true }))).into_response();
    resp.headers_mut().append(
        SET_COOKIE,
        axum::http::HeaderValue::from_str(cookie_str).unwrap(),
    );
    resp
}
