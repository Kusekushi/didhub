use axum::{body::Body, http::Request, middleware::Next, response::Response};

pub async fn error_logging_middleware(req: Request<Body>, next: Next) -> Response {
    let method = req.method().clone();
    let path = req.uri().path().to_string();
    let request_id = req
        .headers()
        .get("x-request-id")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());
    let start = std::time::Instant::now();
    let resp = next.run(req).await;
    let status = resp.status();
    if status.as_u16() >= 400 {
        let err_code = resp
            .headers()
            .get("x-error-code")
            .and_then(|v| v.to_str().ok());
        tracing::error!(target="didhub_server", %method, %path, status=%status.as_u16(), request_id=?request_id, error_code=?err_code, elapsed_ms=%start.elapsed().as_millis(), "request failed");
    }
    resp
}
