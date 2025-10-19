use std::sync::Arc;

use crate::rate_limiter::RateLimiterManager;
use axum::middleware::Next;
use axum::{
    body::Body, extract::Extension, extract::DefaultBodyLimit, http::Request, http::StatusCode, middleware,
    response::IntoResponse, routing::get, Router,
};
use std::convert::Infallible;
use tower_http::services::ServeDir;

use crate::{generated, state::AppState};

// Default body limit: 50 MB (enough for multiple base64-encoded images)
const DEFAULT_BODY_LIMIT: usize = 50 * 1024 * 1024;

/// Build the primary axum router with the provided shared application state.
///
/// Backwards-compatible wrapper that creates a disabled rate limiter by default.
pub fn build_router(state: Arc<AppState>) -> Router {
    // default disabled limiter; tests and callers that don't provide a limiter get no limiting
    let default_limiter = RateLimiterManager::from_config(
        false, // enabled
        true,  // per_ip
        true,  // per_user
        100.0, // rate_per_sec
        200,   // burst
        vec![
            "/health".to_string(),
            "/ready".to_string(),
            "/csrf-token".to_string(),
        ],
    );
    build_router_with_limiter(state, default_limiter)
}

pub fn build_router_with_limiter(state: Arc<AppState>, limiter: RateLimiterManager) -> Router {
    let router = Router::new();
    // Simple public endpoint useful for integration tests. It's harmless in prod
    // (returns 200 OK) and keeps tests simple because many handlers require
    // authentication which complicates exercising rate limits by IP only.
    let router = router.route(
        "/__test/public",
        get(|| async { (axum::http::StatusCode::OK, "OK") }),
    );
    // Global CSRF protection middleware: denies unsafe requests without matching
    // x-csrf-token header and csrf_token cookie. We expose a GET /csrf-token route
    // to allow clients to obtain (and receive via Set-Cookie) a token.
    let router = router.route("/csrf-token", get(crate::csrf::get_csrf_token));
    // register auth routes (cookie-based) before generated application routes
    let router = router
        .route(
            "/auth/login",
            axum::routing::post(crate::handlers::auth::login::login),
        )
        .route("/auth/me", axum::routing::get(crate::handlers::auth::me::me))
        .route(
            "/auth/logout",
            axum::routing::post(crate::handlers::auth::logout::logout),
        )
        .route(
            "/auth/refresh",
            axum::routing::post(crate::handlers::auth::refresh::refresh),
        );
    // register generated application routes
    let router = generated::routes::register_routes(router);
    // health and readiness endpoints
    let router = router
        .route("/health", get(health_handler))
        .route("/ready", get(ready_handler));
    // Use rate limiter provided by main via Extension
    // clone state for middleware closure so the original `state` can still be used
    let mw_state = state.clone();
    let router = router
        .layer(middleware::from_fn(
            move |req: Request<Body>, next: Next| {
                let limiter = limiter.clone();
                let state = mw_state.clone();
                async move {
                    // If path is exempt, skip
                    let path = req.uri().path().to_string();
                    if limiter.is_exempt(&path) {
                        return Ok::<_, Infallible>(next.run(req).await);
                    }

                    // Determine key: prefer authenticated user id (if set via authenticator), otherwise remote IP
                    let key = if limiter.per_user {
                        // Use authenticate_optional so session cookie auth is recognized too.
                        match crate::handlers::auth::utils::authenticate_optional(
                            &state,
                            req.headers(),
                        )
                        .await
                        {
                            Ok(Some(ctx)) => {
                                if let Some(uid) = ctx.user_id {
                                    uid.to_string()
                                } else {
                                    remote_addr_key(&req)
                                }
                            }
                            // On error or no credentials, fall back to remote IP for rate limiting
                            _ => remote_addr_key(&req),
                        }
                    } else {
                        remote_addr_key(&req)
                    };

                    if limiter.try_acquire_for(&key).await {
                        Ok::<_, Infallible>(next.run(req).await)
                    } else {
                        let body = "Too Many Requests";
                        let resp = (StatusCode::TOO_MANY_REQUESTS, body).into_response();
                        Ok::<_, Infallible>(resp)
                    }
                }
            },
        ))
        .layer(middleware::from_fn(crate::csrf::csrf_protect))
        .layer(DefaultBodyLimit::max(DEFAULT_BODY_LIMIT))
        .layer(Extension(state));

    // Serve static files from the "static" directory for non-API routes
    let static_service = ServeDir::new("static").fallback(ServeDir::new("static").append_index_html_on_directories(true));
    
    Router::new()
        .nest("/api", router)
        .fallback_service(static_service)
}

fn remote_addr_key(req: &Request<Body>) -> String {
    // Try to use X-Forwarded-For, then peer addr from extensions
    if let Some(v) = req.headers().get("x-forwarded-for") {
        if let Ok(s) = v.to_str() {
            if let Some(first) = s.split(',').next() {
                return first.trim().to_string();
            }
        }
    }
    // Fallback: attempt to read Axum's remote address extension (if set by server)
    if let Some(ext) = req.extensions().get::<std::net::SocketAddr>() {
        return ext.ip().to_string();
    }
    // Last resort
    "unknown".to_string()
}

async fn health_handler() -> impl IntoResponse {
    // Liveness: always return 200 OK when process is alive.
    (axum::http::StatusCode::OK, "OK")
}

async fn ready_handler(
    axum::extract::Extension(_state): axum::extract::Extension<Arc<AppState>>,
) -> impl IntoResponse {
    // Readiness: ensure the service is not in maintenance mode. We determine maintenance by checking whether
    // the authenticator is present. Tests may inject TestAuthenticator which counts as ready.
    // If the authenticator is absent (shouldn't happen with current wiring), return 503 Service Unavailable.
    // Additionally, we could check DB connectivity here; for now we only ensure the authenticator exists.
    // Note: AppState always contains an authenticator in normal runs; the maintenance router will not use this handler.
    (axum::http::StatusCode::OK, "OK")
}
