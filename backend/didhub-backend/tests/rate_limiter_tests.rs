use axum::body::Body;
use axum::http::{Method, Request, Uri};
use didhub_auth::TestAuthenticator;
use didhub_backend::{rate_limiter::RateLimiterManager, state::AppState};
use didhub_db::{create_pool, DbConnectionConfig};
use didhub_job_queue::JobQueueClient;
use didhub_log_client::LogToolClient;
use didhub_updates::UpdateCoordinator;
use std::sync::Arc;
use tower::util::ServiceExt;

// Start a router with rate limiter configured and issue requests via Service
#[tokio::test]
async fn limiter_blocks_after_burst_per_ip() {
    // Build minimal app state
    let cfg = DbConnectionConfig::new("sqlite::memory:");
    let pool = create_pool(&cfg).await.expect("create pool");
    let log_dir = tempfile::tempdir().expect("tempdir");
    let log_client = LogToolClient::new(log_dir.path().to_str().unwrap());
    let authenticator = Arc::from(Box::new(TestAuthenticator::new_with(
        vec!["user".to_string()],
        None,
    )) as Box<dyn didhub_auth::AuthenticatorTrait>);
    let state = Arc::new(AppState::new(
        pool,
        log_client,
        authenticator,
        JobQueueClient::new(),
        UpdateCoordinator::new(),
    ));

    // Rate limiter: enabled, per_ip, per_user=false, rate_per_sec=10, burst=2
    // NOTE: routes are nested under /api, but middleware sees the stripped path (without /api prefix)
    // so exempt paths should NOT include the /api prefix
    let limiter = RateLimiterManager::from_config(
        true,
        true,
        false,
        10.0,
        2,
        vec![
            "/health".to_string(),
            "/ready".to_string(),
            "/csrf-token".to_string(),
        ],
    );

    let app = didhub_backend::build_router_with_limiter(state.clone(), limiter.clone());

    // two allowed for same IP
    for _ in 0..2 {
        let req = Request::builder()
            .method(Method::GET)
            .uri(Uri::from_static("/api/health")) // exempt path should be allowed always
            .body(Body::empty())
            .unwrap();
        let resp = app.clone().oneshot(req).await.unwrap();
        assert_eq!(resp.status(), 200);
    }

    // Non-exempt path; make 3 requests from same IP
    let uri = Uri::from_static("/api/__test/public");
    let req1 = Request::builder()
        .method(Method::GET)
        .uri(uri.clone())
        .body(Body::empty())
        .unwrap();
    let r1 = app.clone().oneshot(req1).await.unwrap();
    let status1 = r1.status();
    eprintln!("r1 status = {}", status1);
    // print body for debugging
    let bytes = axum::body::to_bytes(r1.into_body(), usize::MAX)
        .await
        .unwrap();
    if let Ok(s) = std::str::from_utf8(&bytes) {
        eprintln!("r1 body = {}", s);
    }
    assert!(status1.is_success());
    let req2 = Request::builder()
        .method(Method::GET)
        .uri(uri.clone())
        .body(Body::empty())
        .unwrap();
    let r2 = app.clone().oneshot(req2).await.unwrap();
    assert!(r2.status().is_success());
    let req3 = Request::builder()
        .method(Method::GET)
        .uri(uri.clone())
        .body(Body::empty())
        .unwrap();
    let r3 = app.clone().oneshot(req3).await.unwrap();
    // third should be 429 due to burst=2
    assert_eq!(r3.status().as_u16(), 429);
}
