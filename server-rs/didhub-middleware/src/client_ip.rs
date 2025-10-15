use axum::extract::Extension;
use axum::{body::Body, http::Request, middleware::Next, response::Response};
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::task_local;

task_local! {
    /// Task-local storage for the current request's IP address.
    /// Set by the `extract_client_ip` middleware for the duration of the request.
    static REQUEST_IP: Arc<String>;
}

/// Middleware that extracts the client IP and inserts it into request extensions
/// under the key `client_ip` as a String.
pub async fn extract_client_ip(mut req: Request<Body>, next: Next) -> Response {
    // Prefer X-Forwarded-For header, otherwise use remote_addr if available.
    let ip = req
        .headers()
        .get("x-forwarded-for")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.split(',').next().map(|s| s.trim().to_string()))
        .or_else(|| {
            // Axum provides a ConnectInfo extractor when used, but in middleware we may
            // not have it. Try to read the remote addr extension if present.
            req.extensions()
                .get::<SocketAddr>()
                .map(|a| a.ip().to_string())
        })
        .unwrap_or_else(|| "".to_string());

    if !ip.is_empty() {
        let arc = Arc::new(ip);
        req.extensions_mut().insert(arc.clone());
        return REQUEST_IP
            .scope(arc, async move { next.run(req).await })
            .await;
    }

    next.run(req).await
}

/// Consume an optional `Extension<String>` (as extracted by handlers) and
/// return an Option<String> containing the IP if present and non-empty.
///
/// This function is intended to be called from handlers which accept
/// `maybe_ip: Option<Extension<String>>` as an extractor. It consumes the
/// extension so callers receive ownership of the String (avoiding borrow
/// lifetime issues) and returns `Some(ip)` when the value is non-empty.
pub fn take_request_ip(maybe_ip: Option<Extension<Arc<String>>>) -> Option<Arc<String>> {
    maybe_ip.map(|Extension(s)| s).filter(|s| !s.is_empty())
}

/// Get the current request IP from task-local storage (set by middleware).
/// Returns an Arc<String> when set, otherwise None.
pub fn get_request_ip() -> Option<Arc<String>> {
    REQUEST_IP.try_with(|v| v.clone()).ok()
}
