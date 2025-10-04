use didhub_server::{build_router, config::AppConfig, db::Db, logging};
use axum::{body::{Body, self}, http::Request};
use tower::util::ServiceExt;

pub fn test_cfg() -> AppConfig {
    let mut cfg = AppConfig::default_for_tests();
    cfg.jwt_secret = "testsecret".into();
    cfg
}

pub async fn setup_router_db() -> (axum::Router, Db) {
    logging::init(false);
    // create DB file inside the OS temp dir to avoid permission/path issues on Windows
    let tmp = std::env::temp_dir();
    let db_file_name = format!("didhub-test-{}-{}.sqlite", uuid::Uuid::new_v4(), std::process::id());
    let db_path = tmp.join(db_file_name);
    if let Some(p) = db_path.parent() { std::fs::create_dir_all(p).ok(); }
    // ensure file exists
    let _ = std::fs::OpenOptions::new().create(true).write(true).open(&db_path).expect("create sqlite file");
    // On Windows the absolute path begins with a drive letter (C:), sqlx expects
    // three slashes after the scheme (sqlite:///C:/path). Always include the
    // extra slash to form a valid absolute file URL for sqlite driver.
    let sqlite_url = format!("sqlite:///{}", db_path.to_string_lossy().replace('\\', "/"));
    // Ensure drivers are available and migrations applied
    sqlx::any::install_default_drivers();
    let pool = sqlx::any::AnyPoolOptions::new().max_connections(1).connect(&sqlite_url).await.expect("connect sqlite");
    didhub_migrations::sqlite_migrator().run(&pool).await.expect("run migrations");
    let db = Db::from_any_pool(pool, didhub_server::db::DbBackend::Sqlite, sqlite_url.clone());
    let cfg = test_cfg();
    let router = build_router(db.clone(), cfg.clone()).await;
    (router, db)
}

// Helpers that operate on an in-process `axum::Router` using oneshot requests
pub async fn register_and_login(app: &axum::Router, username: &str, password: &str, approve: bool, db: &Db) -> String {
    // fetch CSRF cookie/token
    let health = app.clone().oneshot(Request::get("/health").body(Body::empty()).unwrap()).await.unwrap();
    let cookie = health.headers().get("set-cookie").map(|h| h.to_str().unwrap().to_string()).unwrap_or_default();
    let csrf_token = cookie.split(';').next().unwrap_or("").split('=').nth(1).unwrap_or("").to_string();
    let body = serde_json::json!({"username": username, "password": password});
    let resp = app.clone().oneshot(Request::post("/api/auth/register").header("content-type","application/json").header("cookie", &cookie).header("x-csrf-token", &csrf_token).body(Body::from(body.to_string())).unwrap()).await.unwrap();
    assert_eq!(resp.status(), axum::http::StatusCode::OK);
    if approve {
        sqlx::query("UPDATE users SET is_approved = 1 WHERE username = ?").bind(username).execute(&db.pool).await.expect("approve user");
    }
    let health2 = app.clone().oneshot(Request::get("/health").body(Body::empty()).unwrap()).await.unwrap();
    let cookie2 = health2.headers().get("set-cookie").map(|h| h.to_str().unwrap().to_string()).unwrap_or_default();
    let csrf_token2 = cookie2.split(';').next().unwrap_or("").split('=').nth(1).unwrap_or("").to_string();
    let resp2 = app.clone().oneshot(Request::post("/api/auth/login").header("content-type","application/json").header("cookie", &cookie2).header("x-csrf-token", &csrf_token2).body(Body::from(body.to_string())).unwrap()).await.unwrap();
    assert_eq!(resp2.status(), axum::http::StatusCode::OK);
    let body_bytes = body::to_bytes(resp2.into_body(), 64 * 1024).await.unwrap();
    let v: serde_json::Value = serde_json::from_slice(&body_bytes).unwrap();
    v["token"].as_str().unwrap().to_string()
}

pub async fn login(app: &axum::Router, username: &str, password: &str) -> String {
    let health = app.clone().oneshot(Request::get("/health").body(Body::empty()).unwrap()).await.unwrap();
    let cookie = health.headers().get("set-cookie").map(|h| h.to_str().unwrap().to_string()).unwrap_or_default();
    let csrf_token = cookie.split(';').next().unwrap_or("").split('=').nth(1).unwrap_or("").to_string();
    let body = serde_json::json!({"username": username, "password": password});
    let resp = app.clone().oneshot(Request::post("/api/auth/login").header("content-type","application/json").header("cookie", &cookie).header("x-csrf-token", &csrf_token).body(Body::from(body.to_string())).unwrap()).await.unwrap();
    assert_eq!(resp.status(), axum::http::StatusCode::OK);
    let body_bytes = body::to_bytes(resp.into_body(), 64 * 1024).await.unwrap();
    let v: serde_json::Value = serde_json::from_slice(&body_bytes).unwrap();
    v["token"].as_str().unwrap().to_string()
}

pub async fn auth_req(app: &axum::Router, method: axum::http::Method, path: &str, token: &str, body: Option<serde_json::Value>) -> (axum::http::StatusCode, serde_json::Value) {
    let mut builder = Request::builder().method(method.clone()).uri(path).header("authorization", format!("Bearer {}", token));
    if matches!(method, axum::http::Method::POST | axum::http::Method::PUT | axum::http::Method::DELETE | axum::http::Method::PATCH) {
        let health = app.clone().oneshot(Request::get("/health").body(Body::empty()).unwrap()).await.unwrap();
        let cookie = health.headers().get("set-cookie").map(|h| h.to_str().unwrap().to_string()).unwrap_or_default();
        let csrf_token = cookie.split(';').next().unwrap_or("").split('=').nth(1).unwrap_or("").to_string();
        builder = builder.header("cookie", cookie).header("x-csrf-token", csrf_token);
    }
    let req = if let Some(b) = body { builder = builder.header("content-type","application/json"); builder.body(Body::from(b.to_string())).unwrap() } else { builder.body(Body::empty()).unwrap() };
    let resp = app.clone().oneshot(req).await.unwrap();
    let status = resp.status();
    let body_bytes = body::to_bytes(resp.into_body(), 64 * 1024).await.unwrap();
    let v: serde_json::Value = if body_bytes.is_empty() { serde_json::json!({}) } else { serde_json::from_slice(&body_bytes).unwrap_or_else(|_| serde_json::json!({"raw": String::from_utf8_lossy(&body_bytes)})) };
    (status, v)
}
