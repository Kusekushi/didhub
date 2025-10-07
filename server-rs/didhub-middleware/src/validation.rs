//! Validation middleware for common request validations.
//!
//! This module provides middleware for validating common aspects of HTTP requests,
//! such as content types, API versions, etc.

use axum::{
    body::Body,
    http::{header, HeaderValue, Request, StatusCode},
    middleware::Next,
    response::Response,
};

/// Middleware to enforce JSON content type for requests that should contain JSON.
///
/// This middleware checks that POST, PUT, PATCH, and DELETE requests have
/// the `Content-Type: application/json` header. GET, HEAD, and OPTIONS requests
/// are allowed without this check.
///
/// Certain paths are allowlisted to bypass this validation (e.g., file uploads).
pub async fn require_json_content_type(
    req: Request<Body>,
    next: Next,
) -> Response {
    let path = req.uri().path().to_string();

    // Allowlisted paths that don't need JSON content type
    if is_allowlisted_for_content_type(&path) {
        return next.run(req).await;
    }

    let method = req.method();

    // Only check content type for methods that typically send a body
    if matches!(method, &axum::http::Method::POST | &axum::http::Method::PUT | &axum::http::Method::PATCH | &axum::http::Method::DELETE) {
        if let Some(content_type) = req.headers().get(header::CONTENT_TYPE) {
            if content_type != HeaderValue::from_static("application/json") {
                tracing::warn!(
                    method = %method,
                    path = %path,
                    content_type = ?content_type,
                    "Invalid content type for request"
                );
                return Response::builder()
                    .status(StatusCode::UNSUPPORTED_MEDIA_TYPE)
                    .body(Body::empty())
                    .unwrap();
            }
        } else {
            tracing::warn!(method = %method, path = %path, "Missing content type header");
            return Response::builder()
                .status(StatusCode::UNSUPPORTED_MEDIA_TYPE)
                .body(Body::empty())
                .unwrap();
        }
    }

    next.run(req).await
}

/// Check if a path is allowlisted for content type validation bypass.
fn is_allowlisted_for_content_type(path: &str) -> bool {
    // File upload endpoints
    path.starts_with("/api/upload") || path.starts_with("/api/me/avatar")
}

/// Middleware to validate API version from Accept header.
///
/// This middleware checks for an API version in the Accept header and
/// ensures it's a supported version. Currently supports "application/vnd.didhub.v1+json".
pub async fn validate_api_version(
    req: Request<Body>,
    next: Next,
) -> Response {
    if let Some(accept) = req.headers().get(header::ACCEPT) {
        let accept_str = accept.to_str().unwrap_or("");
        if accept_str.contains("application/vnd.didhub.v1+json") || accept_str.contains("*/*") || accept_str.contains("application/json") {
            // Valid version or wildcard
        } else {
            tracing::warn!(accept = %accept_str, "Unsupported API version requested");
            return Response::builder()
                .status(StatusCode::NOT_ACCEPTABLE)
                .body(Body::empty())
                .unwrap();
        }
    }

    next.run(req).await
}

/// Middleware to add default security headers to responses.
///
/// This adds common security headers like X-Content-Type-Options, X-Frame-Options, etc.
/// Note: This is a basic implementation; the main security headers are handled
/// in the security_headers module in the server crate.
pub async fn default_security_headers(
    req: Request<Body>,
    next: Next,
) -> Response {
    let mut resp = next.run(req).await;

    let headers = resp.headers_mut();

    // Add security headers if not already present
    if !headers.contains_key("x-content-type-options") {
        headers.insert("x-content-type-options", HeaderValue::from_static("nosniff"));
    }

    if !headers.contains_key("x-frame-options") {
        headers.insert("x-frame-options", HeaderValue::from_static("DENY"));
    }

    if !headers.contains_key("referrer-policy") {
        headers.insert("referrer-policy", HeaderValue::from_static("strict-origin-when-cross-origin"));
    }

    resp
}