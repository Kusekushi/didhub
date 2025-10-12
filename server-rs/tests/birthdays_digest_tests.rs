use didhub_server::{config::AppConfig, db::Db};
use axum::{body::Body, http::{Request, StatusCode}};
use http_body_util::BodyExt;
use tower::ServiceExt;
use serde_json::json;
use chrono::{Utc, Duration};

async fn setup() -> (axum::Router, Db, String) {
    let db_file = format!("test-db-bd-{}.sqlite", uuid::Uuid::new_v4());
    if std::path::Path::new(&db_file).exists() { let _ = std::fs::remove_file(&db_file); }
    if let Some(p) = std::path::Path::new(&db_file).parent() { std::fs::create_dir_all(p).ok(); }
    let _ = std::fs::OpenOptions::new().create(true).write(true).open(&db_file).expect("create sqlite file");
    let sqlite_url = format!("sqlite://{}", db_file.replace('\\', "/"));
    sqlx::any::install_default_drivers();
    let pool = sqlx::any::AnyPoolOptions::new().max_connections(1).connect(&sqlite_url).await.expect("connect sqlite");
    let db = Db::from_any_pool(pool, didhub_server::db::DbBackend::Sqlite, sqlite_url.clone());
    let mut cfg = AppConfig::default_for_tests();
    cfg.bootstrap_admin_username = Some("admin".into());
    cfg.bootstrap_admin_password = Some("adminpw".into());
    db.ensure_bootstrap_admin(&cfg).await.unwrap();
    let app_components = didhub_server::build_app(db.clone(), cfg).await;
    let app = app_components.router;
    // fetch CSRF for login
    let health = app.clone().oneshot(Request::get("/health").body(Body::empty()).unwrap()).await.unwrap();
    let cookie = health.headers().get("set-cookie").map(|h| h.to_str().unwrap().to_string()).unwrap_or_default();
    let csrf = cookie.split(';').next().unwrap_or("").split('=').nth(1).unwrap_or("").to_string();
    // login admin
    let login = Request::builder().method("POST").uri("/api/auth/login").header("content-type","application/json").header("cookie", &cookie).header("x-csrf-token", &csrf).body(Body::from(json!({"username":"admin","password":"adminpw"}).to_string())).unwrap();
    let resp = app.clone().oneshot(login).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
    let body_bytes = resp.into_body().collect().await.unwrap().to_bytes();
    let v: serde_json::Value = serde_json::from_slice(&body_bytes).unwrap();
    let token = v["token"].as_str().unwrap().to_string();
    (app, db, token)
}

#[tokio::test]
async fn birthdays_digest_job_records_audit() {
    let (app, db, token) = setup().await;
    // Set webhook so job runs
    let health2 = app.clone().oneshot(Request::get("/health").body(Body::empty()).unwrap()).await.unwrap();
    let cookie2 = health2.headers().get("set-cookie").map(|h| h.to_str().unwrap().to_string()).unwrap_or_default();
    let csrf2 = cookie2.split(';').next().unwrap_or("").split('=').nth(1).unwrap_or("").to_string();
    let set_webhook = Request::builder().method("PUT").uri("/api/settings/discord.webhook")
        .header("authorization", format!("Bearer {}", token))
        .header("content-type","application/json")
        .header("cookie", &cookie2)
        .header("x-csrf-token", &csrf2)
        .body(Body::from(json!({"value":"https://example.com/webhook"}).to_string())).unwrap();
    let resp = app.clone().oneshot(set_webhook).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);

    // Create alters with birthdays: one within 3 days, one far
    let soon = (Utc::now() + Duration::days(2)).format("%m-%d").to_string();
    let far = (Utc::now() + Duration::days(30)).format("%m-%d").to_string();
    let health3 = app.clone().oneshot(Request::get("/health").body(Body::empty()).unwrap()).await.unwrap();
    let cookie3 = health3.headers().get("set-cookie").map(|h| h.to_str().unwrap().to_string()).unwrap_or_default();
    let csrf3 = cookie3.split(';').next().unwrap_or("").split('=').nth(1).unwrap_or("").to_string();
    let create1 = Request::builder().method("POST").uri("/api/alters")
        .header("authorization", format!("Bearer {}", token))
        .header("content-type","application/json")
        .header("cookie", &cookie3)
        .header("x-csrf-token", &csrf3)
        .body(Body::from(json!({"name":"Alice"}).to_string())).unwrap();
    let resp = app.clone().oneshot(create1).await.unwrap(); assert_eq!(resp.status(), StatusCode::OK);
    let body_bytes = resp.into_body().collect().await.unwrap().to_bytes();
    let a1: serde_json::Value = serde_json::from_slice(&body_bytes).unwrap();
    let a1_id = a1["id"].as_str().unwrap().to_string();
    let health4 = app.clone().oneshot(Request::get("/health").body(Body::empty()).unwrap()).await.unwrap();
    let cookie4 = health4.headers().get("set-cookie").map(|h| h.to_str().unwrap().to_string()).unwrap_or_default();
    let csrf4 = cookie4.split(';').next().unwrap_or("").split('=').nth(1).unwrap_or("").to_string();
    let upd1 = Request::builder().method("PUT").uri(format!("/api/alters/{}", a1_id))
        .header("authorization", format!("Bearer {}", token))
        .header("content-type","application/json")
        .header("cookie", &cookie4)
        .header("x-csrf-token", &csrf4)
        .body(Body::from(json!({"birthday":soon}).to_string())).unwrap();
    let resp = app.clone().oneshot(upd1).await.unwrap(); assert_eq!(resp.status(), StatusCode::OK);

    let health5 = app.clone().oneshot(Request::get("/health").body(Body::empty()).unwrap()).await.unwrap();
    let cookie5 = health5.headers().get("set-cookie").map(|h| h.to_str().unwrap().to_string()).unwrap_or_default();
    let csrf5 = cookie5.split(';').next().unwrap_or("").split('=').nth(1).unwrap_or("").to_string();
    let create2 = Request::builder().method("POST").uri("/api/alters")
        .header("authorization", format!("Bearer {}", token))
        .header("content-type","application/json")
        .header("cookie", &cookie5)
        .header("x-csrf-token", &csrf5)
        .body(Body::from(json!({"name":"Bob"}).to_string())).unwrap();
    let resp = app.clone().oneshot(create2).await.unwrap(); assert_eq!(resp.status(), StatusCode::OK);
    let body_bytes = resp.into_body().collect().await.unwrap().to_bytes();
    let a2: serde_json::Value = serde_json::from_slice(&body_bytes).unwrap();
    let a2_id = a2["id"].as_str().unwrap().to_string();
    let health6 = app.clone().oneshot(Request::get("/health").body(Body::empty()).unwrap()).await.unwrap();
    let cookie6 = health6.headers().get("set-cookie").map(|h| h.to_str().unwrap().to_string()).unwrap_or_default();
    let csrf6 = cookie6.split(';').next().unwrap_or("").split('=').nth(1).unwrap_or("").to_string();
    let upd2 = Request::builder().method("PUT").uri(format!("/api/alters/{}", a2_id))
        .header("authorization", format!("Bearer {}", token))
        .header("content-type","application/json")
        .header("cookie", &cookie6)
        .header("x-csrf-token", &csrf6)
        .body(Body::from(json!({"birthday":far}).to_string())).unwrap();
    let resp = app.clone().oneshot(upd2).await.unwrap(); assert_eq!(resp.status(), StatusCode::OK);

    // Trigger job
    let health7 = app.clone().oneshot(Request::get("/health").body(Body::empty()).unwrap()).await.unwrap();
    let cookie7 = health7.headers().get("set-cookie").map(|h| h.to_str().unwrap().to_string()).unwrap_or_default();
    let csrf7 = cookie7.split(';').next().unwrap_or("").split('=').nth(1).unwrap_or("").to_string();
    let trigger = Request::builder().method("POST").uri("/api/housekeeping/trigger/birthdays_digest")
        .header("authorization", format!("Bearer {}", token))
        .header("cookie", &cookie7)
        .header("x-csrf-token", &csrf7)
        .body(Body::empty()).unwrap();
    let resp = app.clone().oneshot(trigger).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);

    // Verify audit entry logged
    let count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM audit_log WHERE action='digest.birthdays'")
        .fetch_one(&db.pool).await.unwrap();
    assert_eq!(count.0, 1, "expected one digest audit entry");
}
