use argon2::password_hash::rand_core::{OsRng, RngCore};
use axum::body::Body;
use axum::extract::Extension;
use axum::http::{Request, StatusCode};
use axum::middleware::Next;
use axum::response::{IntoResponse, Json, Response};
use cookie::Cookie;
use serde::Serialize;
use std::sync::Arc;

use crate::state::AppState;

#[derive(Serialize)]
struct CsrfResponse {
    token: String,
}

/// Generate a cryptographically secure random token as hex string.
fn generate_token() -> String {
    let mut buf = [0u8; 32];
    let mut rng = OsRng;
    rng.fill_bytes(&mut buf);
    hex::encode(buf)
}

/// GET /csrf-token
/// Returns a JSON body with the token and also sets a cookie named `csrf_token`.
/// This implements the double-submit cookie pattern: the client should read the cookie and
/// send the same value in the `x-csrf-token` header for state-changing requests.
pub async fn get_csrf_token(Extension(_state): Extension<Arc<AppState>>) -> impl IntoResponse {
    let token = generate_token();
    // Build cookie: readable by JS (HttpOnly = false) so SPA can read it and include header.
    let cookie = Cookie::build(("csrf_token", token.clone()))
        .path("/")
        .same_site(cookie::SameSite::Lax)
        .secure(false)
        .build();

    let mut resp = (StatusCode::OK, Json(CsrfResponse { token })).into_response();
    // append Set-Cookie header
    resp.headers_mut().append(
        axum::http::header::SET_COOKIE,
        axum::http::HeaderValue::from_str(&cookie.to_string()).unwrap(),
    );
    resp
}

/// Middleware that enforces CSRF protection for unsafe HTTP methods.
/// It expects a cookie named `csrf_token` and a header `x-csrf-token` with the same value.
pub async fn csrf_protect(req: Request<Body>, next: Next) -> Response {
    use axum::http::Method;

    // Allow safe methods without check
    let method = req.method().clone();
    if method == Method::GET || method == Method::HEAD || method == Method::OPTIONS {
        return next.run(req).await;
    }

    // For other methods, check header and cookie
    let header_tok = req
        .headers()
        .get("x-csrf-token")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());

    let cookie_header = req
        .headers()
        .get(axum::http::header::COOKIE)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());
    let cookie_tok = cookie_header.as_deref().and_then(|cookies| {
        // Parse cookies and look for csrf_token
        for c in cookies.split(';') {
            if let Ok(parsed) = Cookie::parse(c.trim()) {
                if parsed.name() == "csrf_token" {
                    return Some(parsed.value().to_string());
                }
            }
        }
        None
    });

    match (cookie_tok, header_tok) {
        (Some(c), Some(h)) if c == h => next.run(req).await,
        _ => {
            let body = Json(serde_json::json!({"error":"missing or invalid CSRF token"}));
            (StatusCode::FORBIDDEN, body).into_response()
        }
    }
}
