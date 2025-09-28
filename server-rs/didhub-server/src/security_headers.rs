use axum::middleware::Next;
use axum::{
    body::Body,
    http::{HeaderValue, Request},
    response::Response,
};
use didhub_config::AppConfig;
use didhub_error::AppError;
use tracing::{debug, warn};
pub async fn apply_security_headers(
    axum::Extension(cfg): axum::Extension<AppConfig>,
    req: Request<Body>,
    next: Next,
) -> Result<Response, AppError> {
    let method = req.method().as_str().to_string();
    let path = req.uri().path().to_string();

    debug!(method=%method, path=%path, "applying security headers to response");

    let mut resp = next.run(req).await;
    {
        let headers = resp.headers_mut();

        // Apply standard security headers
        headers.insert("X-Frame-Options", HeaderValue::from_static("DENY"));
        headers.insert(
            "X-Content-Type-Options",
            HeaderValue::from_static("nosniff"),
        );
        headers.insert(
            "Referrer-Policy",
            HeaderValue::from_static("strict-origin-when-cross-origin"),
        );
        headers.insert(
            "Permissions-Policy",
            HeaderValue::from_static("geolocation=(), microphone=(), camera=()"),
        );
        headers.insert(
            "Cross-Origin-Opener-Policy",
            HeaderValue::from_static("same-origin"),
        );
        headers.insert(
            "Cross-Origin-Embedder-Policy",
            HeaderValue::from_static("require-corp"),
        );
        headers.insert(
            "Cross-Origin-Resource-Policy",
            HeaderValue::from_static("same-origin"),
        );

        // Apply Content Security Policy if configured
        if let Some(csp) = cfg.content_security_policy.as_ref() {
            if let Ok(val) = HeaderValue::from_str(csp) {
                headers.insert("Content-Security-Policy", val);
                debug!("applied custom Content-Security-Policy header");
            } else {
                warn!(csp_value=%csp, "invalid Content-Security-Policy value, skipping header");
            }
        } else {
            debug!("no Content-Security-Policy configured");
        }

        // Apply HSTS if enabled
        if cfg.enable_hsts {
            headers.insert(
                "Strict-Transport-Security",
                HeaderValue::from_static("max-age=63072000; includeSubDomains; preload"),
            );
            debug!("applied Strict-Transport-Security header (HSTS enabled)");
        } else {
            debug!("HSTS disabled in configuration");
        }
    }

    debug!(method=%method, path=%path, "security headers applied successfully");
    Ok(resp)
}
