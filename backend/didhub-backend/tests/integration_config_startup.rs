use std::net::Ipv4Addr;

use didhub_backend::build_router;
use didhub_backend::state::AppState;
use didhub_db::DbConnectionConfig;
use didhub_log_client::LogToolClient;

#[tokio::test]
async fn startup_with_config_binds_and_serves_health() {
    // use Config::default for minimal defaults (includes rate_limit defaults)
    let _cfg = didhub_config::Config::default();

    // Create DB pool
    let db_conf = DbConnectionConfig::new("sqlite::memory:");
    let pool = didhub_db::create_pool(&db_conf).await.expect("create pool");

    // Create log client
    let log_client = LogToolClient::from_directory(".".to_string());

    // Create authenticator: use HS256 secret (test-only)
    let authenticator = std::sync::Arc::new(didhub_auth::JwtAuthenticator::new_hs256(
        "test-secret".to_string(),
    )) as std::sync::Arc<dyn didhub_auth::AuthenticatorTrait>;

    let state = AppState::new(
        pool,
        log_client,
        authenticator,
        didhub_job_queue::JobQueueClient::new(),
        didhub_updates::UpdateCoordinator::new(),
    );
    let router = build_router(state.into());

    // Bind to ephemeral port using tokio TcpListener (new axum 0.7 pattern)
    let listener = tokio::net::TcpListener::bind((Ipv4Addr::LOCALHOST, 0))
        .await
        .expect("bind");
    let addr = listener.local_addr().expect("local_addr");

    let handle = tokio::spawn(async move {
        axum::serve(listener, router.into_make_service())
            .await
            .unwrap();
    });

    // Give server a moment to start
    tokio::time::sleep(std::time::Duration::from_millis(500)).await;

    let url = format!("http://{}:{}/api/health", addr.ip(), addr.port());
    let res = reqwest::get(&url).await.expect("request");
    assert!(res.status().is_success());

    // Shutdown server
    handle.abort();
}
