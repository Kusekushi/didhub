use std::sync::Arc;

use axum::extract::Extension;
use axum::http::{header::SET_COOKIE, StatusCode};
use axum::response::{IntoResponse, Json};
use cookie::Cookie;
use serde_json::json;

use crate::state::AppState;

pub async fn logout(Extension(_state): Extension<Arc<AppState>>) -> impl IntoResponse {
    let cookie = Cookie::build(("didhub_session", ""))
        .path("/")
        .http_only(true)
        .secure(true)
        .same_site(cookie::SameSite::Lax)
        .max_age(cookie::time::Duration::seconds(0))
        .build();

    let mut resp = (StatusCode::OK, Json(json!({ "ok": true }))).into_response();
    resp.headers_mut().append(
        SET_COOKIE,
        axum::http::HeaderValue::from_str(&cookie.to_string()).unwrap(),
    );
    resp
}
