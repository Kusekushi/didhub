use axum::middleware::Next;
use axum::{
    body::Body,
    http::{HeaderValue, Request, StatusCode},
    response::{IntoResponse, Response},
};
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use rand::RngCore;
use tracing::{debug, info, warn};

#[derive(Debug)]
pub struct CsrfError;

impl IntoResponse for CsrfError {
    fn into_response(self) -> Response {
        (StatusCode::FORBIDDEN, "CSRF validation failed").into_response()
    }
}

const COOKIE_NAME: &str = "csrf_token";
const HEADER_NAME: &str = "X-CSRF-Token";
const ROTATE_TRIGGER_HEADER: &str = "X-Set-CSRF-Rotate"; // internal use

pub fn is_safe_method(m: &str) -> bool {
    matches!(m, "GET" | "HEAD" | "OPTIONS" | "TRACE")
}

pub fn is_allowlisted(path: &str) -> bool {
    path.starts_with("/api/auth/") || path.starts_with("/api/password-reset/")
}

pub fn generate_token() -> String {
    let mut buf = [0u8; 32];
    let mut rng = rand::thread_rng();
    rng.fill_bytes(&mut buf);
    URL_SAFE_NO_PAD.encode(buf)
}

pub fn build_cookie(value: &str) -> String {
    let mut parts = vec![
        format!("{}={}", COOKIE_NAME, value),
        "Path=/".to_string(),
        "SameSite=Strict".to_string(),
    ];
    // Add Secure unless running tests (detect by RUSTFLAGS or presence of TEST env). Simplest: honor DIDHUB_DISABLE_SECURE for test harness.
    let disabled = std::env::var("DIDHUB_DISABLE_SECURE").ok().is_some();
    if !disabled {
        parts.push("Secure".to_string());
    }
    parts.join("; ")
}

pub async fn csrf_middleware(
    req: Request<Body>,
    next: Next,
) -> Result<Response, didhub_error::AppError> {
    let path = req.uri().path().to_string();
    let method = req.method().as_str().to_string();

    debug!(method=%method, path=%path, "CSRF middleware processing request");

    let mut token_cookie: Option<String> = None;

    if let Some(cookie_hdr) = req
        .headers()
        .get(axum::http::header::COOKIE)
        .and_then(|v| v.to_str().ok())
    {
        for part in cookie_hdr.split(';') {
            let trimmed = part.trim();
            if let Some((k, v)) = trimmed.split_once('=') {
                if k == COOKIE_NAME {
                    token_cookie = Some(v.to_string());
                    break;
                }
            }
        }
    }

    // For safe methods: ensure cookie exists (set if missing) and pass through
    if is_safe_method(&method) {
        debug!(method=%method, path=%path, has_token=%token_cookie.is_some(), "safe method - allowing request");
        let mut resp = next.run(req).await;
        let rotate = resp.headers().get(ROTATE_TRIGGER_HEADER).is_some();
        if token_cookie.is_none() || rotate {
            let new_token = generate_token();
            let cookie = build_cookie(&new_token);
            resp.headers_mut().append(
                axum::http::header::SET_COOKIE,
                HeaderValue::from_str(&cookie).unwrap(),
            );
            if rotate {
                info!(method=%method, path=%path, "rotating CSRF token after successful operation");
            } else {
                debug!(method=%method, path=%path, "issuing new CSRF token for safe method");
            }
        }
        if rotate {
            resp.headers_mut().remove(ROTATE_TRIGGER_HEADER);
        }
        return Ok(resp);
    }

    if is_allowlisted(&path) {
        debug!(method=%method, path=%path, "allowlisted path - skipping CSRF validation");
        return Ok(next.run(req).await);
    }

    let header_token = req.headers().get(HEADER_NAME).and_then(|v| v.to_str().ok());
    debug!(method=%method, path=%path, has_cookie_token=%token_cookie.is_some(), has_header_token=%header_token.is_some(), "validating CSRF tokens");

    match (token_cookie.as_deref(), header_token) {
        (Some(c), Some(h)) if c == h => {
            debug!(method=%method, path=%path, "CSRF validation successful");
            let mut resp = next.run(req).await;
            // Propagate rotation if downstream set header (e.g., after login) by issuing new cookie
            if resp.headers().get(ROTATE_TRIGGER_HEADER).is_some() {
                let new_token = generate_token();
                let cookie = build_cookie(&new_token);
                resp.headers_mut().append(
                    axum::http::header::SET_COOKIE,
                    HeaderValue::from_str(&cookie).unwrap(),
                );
                resp.headers_mut().remove(ROTATE_TRIGGER_HEADER);
                info!(method=%method, path=%path, "rotating CSRF token after successful operation");
            }
            Ok(resp)
        }
        (cookie_present, header_present) => {
            warn!(
                method=%method,
                path=%path,
                cookie_present=%cookie_present.is_some(),
                header_present=%header_present.is_some(),
                "CSRF validation failed - tokens do not match or missing"
            );
            Err(didhub_error::AppError::Forbidden)
        }
    }
}
