use axum::{body::Body, http::Request, middleware::Next, response::Response};
use std::time::Instant;

pub async fn request_logger(req: Request<Body>, next: Next) -> Response {
    let method = req.method().clone();
    // include query string for better debugging
    let uri = req.uri().to_string();
    tracing::debug!(method=%method, uri=%uri, "incoming request");
    let start = Instant::now();
    let resp = next.run(req).await;
    let dur = start.elapsed();
    tracing::debug!(method=%method, uri=%uri, status=%resp.status().as_u16(), duration_ms=%dur.as_millis(), "request completed");
    resp
}
