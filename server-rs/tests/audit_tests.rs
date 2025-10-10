use didhub_server::{config::AppConfig, db::Db};
use axum::{Router, body::Body, http::{Request, StatusCode}};
use http_body_util::BodyExt; // for collect
use tower::ServiceExt;
use serde_json::json;
use didhub_migrations::sqlite_migrator;

async fn test_ctx() -> (Router, Db, String) {
    // tracing optional in tests
    let db_file = format!("test-db-{}.sqlite", uuid::Uuid::new_v4());
    let sqlite_url = format!("sqlite://{}", db_file.replace('\\', "/"));
    // Ensure parent dir and sqlite file exist (Windows can fail to open otherwise)
    if std::path::Path::new(&db_file).exists() { let _ = std::fs::remove_file(&db_file); }
    if let Some(p) = std::path::Path::new(&db_file).parent() { std::fs::create_dir_all(p).ok(); }
    let _ = std::fs::OpenOptions::new().create(true).write(true).open(&db_file).expect("create sqlite file");
    // Register any sqlx drivers for in-process AnyPool usage
    sqlx::any::install_default_drivers();
    let pool = sqlx::any::AnyPoolOptions::new().max_connections(1).connect(&sqlite_url).await.expect("connect sqlite");
    // Ensure migrations are applied for the test DB so tables exist
    sqlite_migrator().run(&pool).await.expect("run migrations");
    let db = Db::from_any_pool(pool, didhub_server::db::DbBackend::Sqlite, sqlite_url.clone());
    let mut cfg = AppConfig::default_for_tests();
    cfg.bootstrap_admin_username = Some("admin".into());
    cfg.bootstrap_admin_password = Some("adminpw".into());
    db.ensure_bootstrap_admin(&cfg).await.unwrap();
    let app_components = didhub_server::build_app(db.clone(), cfg).await;
    let router = app_components.router;
    // fetch CSRF cookie/token
    let health = router.clone().oneshot(Request::get("/health").body(Body::empty()).unwrap()).await.unwrap();
    let cookie = health.headers().get("set-cookie").map(|h| h.to_str().unwrap().to_string()).unwrap_or_default();
    let csrf_token = cookie.split(';').next().unwrap_or("").split('=').nth(1).unwrap_or("").to_string();
    // admin login
    let login = Request::builder().method("POST").uri("/api/auth/login").header("content-type","application/json").header("cookie", &cookie).header("x-csrf-token", &csrf_token).body(Body::from(json!({"username":"admin","password":"adminpw"}).to_string())).unwrap();
    let resp = router.clone().oneshot(login).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
    let body_bytes = resp.into_body().collect().await.unwrap().to_bytes();
    let v: serde_json::Value = serde_json::from_slice(&body_bytes).unwrap();
    let token = v.get("token").and_then(|t| t.as_str()).unwrap().to_string();
    (router, db, token)
}

#[tokio::test]
async fn audit_flow() {
    let (app, _db, admin_token) = test_ctx().await;

    // trigger a settings update (creates audit)
    // fetch fresh CSRF for mutating requests
    let health_m = app.clone().oneshot(Request::get("/health").body(Body::empty()).unwrap()).await.unwrap();
    let cookie_m = health_m.headers().get("set-cookie").map(|h| h.to_str().unwrap().to_string()).unwrap_or_default();
    let csrf_m = cookie_m.split(';').next().unwrap_or("").split('=').nth(1).unwrap_or("").to_string();
    let put = Request::builder().method("PUT").uri("/api/settings/site.title").header("authorization", format!("Bearer {}", admin_token)).header("content-type","application/json").header("cookie", &cookie_m).header("x-csrf-token", &csrf_m).body(Body::from(json!({"value":"Title"}).to_string())).unwrap();
    let resp = app.clone().oneshot(put).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);

    // list audit
    let list = Request::builder().method("GET").uri("/api/audit").header("authorization", format!("Bearer {}", admin_token)).body(Body::empty()).unwrap();
    let resp = app.clone().oneshot(list).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
    let body_bytes = resp.into_body().collect().await.unwrap().to_bytes();
    let arr: serde_json::Value = serde_json::from_slice(&body_bytes).unwrap();
    assert!(arr.as_array().unwrap().len() >= 1);

    // purge with future timestamp (no deletes)
    let purge = Request::builder().method("POST").uri("/api/audit/purge").header("authorization", format!("Bearer {}", admin_token)).header("content-type","application/json").header("cookie", &cookie_m).header("x-csrf-token", &csrf_m).body(Body::from(json!({"before":"2999-01-01T00:00:00Z"}).to_string())).unwrap();
    let resp = app.clone().oneshot(purge).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);

    // date range query (using far past to now) should return >=1
    let range = Request::builder().method("GET").uri("/api/audit?from=2000-01-01T00:00:00Z&to=2999-01-01T00:00:00Z").header("authorization", format!("Bearer {}", admin_token)).body(Body::empty()).unwrap();
    let resp = app.clone().oneshot(range).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);

    // clear all
    let clear = Request::builder().method("POST").uri("/api/audit/clear").header("authorization", format!("Bearer {}", admin_token)).header("cookie", &cookie_m).header("x-csrf-token", &csrf_m).body(Body::empty()).unwrap();
    let resp = app.clone().oneshot(clear).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);

    // list again should be empty
    let list2 = Request::builder().method("GET").uri("/api/audit").header("authorization", format!("Bearer {}", admin_token)).body(Body::empty()).unwrap();
    let resp = app.clone().oneshot(list2).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
    let body_bytes = resp.into_body().collect().await.unwrap().to_bytes();
    let arr2: serde_json::Value = serde_json::from_slice(&body_bytes).unwrap();
    assert_eq!(arr2.as_array().unwrap().len(), 0);
}
