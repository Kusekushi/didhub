use didhub_server::{db::Db, config::AppConfig};
use tower::ServiceExt;
use axum::http::Request;
use axum::body::Body;

#[tokio::test]
async fn security_headers_present() {
    let db_file = format!("test-data/sec-{}.sqlite", uuid::Uuid::new_v4());
    let sqlite_url = format!("sqlite://{}", db_file.replace('\\', "/"));
    if std::path::Path::new(&db_file).exists() { let _ = std::fs::remove_file(&db_file); }
    if let Some(p) = std::path::Path::new(&db_file).parent() { std::fs::create_dir_all(p).ok(); }
    let _ = std::fs::OpenOptions::new().create(true).write(true).open(&db_file).expect("create sqlite file");
    sqlx::any::install_default_drivers();
    let pool = sqlx::any::AnyPoolOptions::new().max_connections(1).connect(&sqlite_url).await.expect("connect sqlite");
    let db = Db::from_any_pool(pool, didhub_server::db::DbBackend::Sqlite, sqlite_url.clone());
    let mut cfg = AppConfig::default_for_tests();
    cfg.content_security_policy = Some("default-src 'self'".into());
    cfg.enable_hsts = true; // tests run http but we can still set header
    let app_components = didhub_server::build_app(db, cfg).await;
    let app = app_components.router;
    let resp = app.clone().oneshot(Request::builder().uri("/health").body(Body::empty()).unwrap()).await.unwrap();
    assert!(resp.headers().get("X-Frame-Options").is_some());
    assert!(resp.headers().get("X-Content-Type-Options").is_some());
    assert!(resp.headers().get("Content-Security-Policy").is_some());
    assert!(resp.headers().get("Strict-Transport-Security").is_some());
}
