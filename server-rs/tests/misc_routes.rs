use didhub_server::{config::AppConfig, db::Db, logging};
use axum::{body::Body, http::Request, http::StatusCode};
use tower::util::ServiceExt;

fn test_cfg() -> AppConfig { let mut c = AppConfig::default_for_tests(); c.jwt_secret = "s".into(); c }

#[test]
fn logging_init_variants() {
    // Initialize logging once; tracing subscriber cannot be set twice in the same process.
    logging::init(false);
}

#[tokio::test]
async fn health_and_version_routes() {
    let db_path = format!("test-{}.db", uuid::Uuid::new_v4());
    if std::path::Path::new(&db_path).exists() { let _ = std::fs::remove_file(&db_path); }
    if let Some(p) = std::path::Path::new(&db_path).parent() { std::fs::create_dir_all(p).ok(); }
    let _ = std::fs::OpenOptions::new().create(true).write(true).open(&db_path).expect("create sqlite file");
    let sqlite_url = format!("sqlite://{}", db_path.replace('\\', "/"));
    sqlx::any::install_default_drivers();
    let pool = sqlx::any::AnyPoolOptions::new().max_connections(1).connect(&sqlite_url).await.expect("connect sqlite");
    let db = Db::from_any_pool(pool, didhub_server::db::DbBackend::Sqlite, sqlite_url.clone());
    let cfg = test_cfg();
    let app_components = didhub_server::build_app(db.clone(), cfg.clone()).await;
    let app = app_components.router;

    // health
    let resp = app.clone().oneshot(Request::get("/health").body(Body::empty()).unwrap()).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);

    // version (public under /api)
    let resp2 = app.clone().oneshot(Request::get("/api/version").body(Body::empty()).unwrap()).await.unwrap();
    assert_eq!(resp2.status(), StatusCode::OK);
}
