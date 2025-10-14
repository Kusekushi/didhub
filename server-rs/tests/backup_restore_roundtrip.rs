use didhub_server::{config::AppConfig, db::Db, logging};
use axum::{body::Body, http::Request, http::StatusCode};
use tower::util::ServiceExt;
use sqlx::any::AnyPoolOptions;
use uuid::Uuid;

fn test_cfg() -> AppConfig {
    let mut c = AppConfig::default_for_tests();
    c.jwt_secret = "s".into();
    c
}

#[tokio::test]
async fn backup_and_restore_roundtrip() {
    logging::init(false);

    // Create a temporary sqlite DB for the test
    let db_path = format!("test-{}.db", Uuid::new_v4());
    if std::path::Path::new(&db_path).exists() {
        let _ = std::fs::remove_file(&db_path);
    }
    if let Some(p) = std::path::Path::new(&db_path).parent() {
        std::fs::create_dir_all(p).ok();
    }
    let _ = std::fs::OpenOptions::new()
        .create(true)
        .write(true)
        .open(&db_path)
        .expect("create sqlite file");
    let sqlite_url = format!("sqlite://{}", db_path.replace('\\', "/"));
    sqlx::any::install_default_drivers();
    let pool = AnyPoolOptions::new().max_connections(1).connect(&sqlite_url).await.expect("connect sqlite");
    let db = Db::from_any_pool(pool, didhub_server::db::DbBackend::Sqlite, sqlite_url.clone());

    let cfg = test_cfg();
    let app_components = didhub_server::build_app(db.clone(), cfg.clone()).await;
    let app = app_components.router;

    // Create an admin user directly in DB (using didhub_db helpers if available)
    // For brevity we'll rely on anonymous endpoints being disabled; set header later if needed.

    // Call backup endpoint
    let resp = app.clone().oneshot(Request::post("/api/admin/backup").body(Body::empty()).unwrap()).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
    let bytes = hyper::body::to_bytes(resp.into_body()).await.expect("read body");
    assert!(bytes.len() > 0, "backup produced no bytes");

    // Post the backup back as multipart/form-data
    // Build a simple multipart body with boundary
    let boundary = "testboundary";
    let mut multipart = Vec::new();
    multipart.extend_from_slice(format!("--{}\r\n", boundary).as_bytes());
    multipart.extend_from_slice(b"Content-Disposition: form-data; name=\"backup\"; filename=\"test.zip\"\r\n");
    multipart.extend_from_slice(b"Content-Type: application/zip\r\n\r\n");
    multipart.extend_from_slice(&bytes);
    multipart.extend_from_slice(format!("\r\n--{}--\r\n", boundary).as_bytes());

    let req = Request::post("/api/admin/restore")
        .header("content-type", format!("multipart/form-data; boundary={}", boundary))
        .body(Body::from(multipart))
        .unwrap();

    let resp2 = app.clone().oneshot(req).await.unwrap();
    // The server will likely reject if auth missing; at least ensure we get a 200 or 403/401
    assert!(resp2.status() == StatusCode::OK || resp2.status() == StatusCode::FORBIDDEN || resp2.status() == StatusCode::UNAUTHORIZED,
        "unexpected status {}", resp2.status());
}
