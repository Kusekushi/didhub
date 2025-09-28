use didhub_server::{db::Db, config::AppConfig};
use axum::{Router, body::Body};
use axum::http;
use tower::ServiceExt;
use serde_json::json;

async fn setup() -> (Router, String) {
    let db_file = format!("test-db-chgpw-{}.sqlite", uuid::Uuid::new_v4());
    let sqlite_url = format!("sqlite://{}", db_file.replace('\\',"/"));
    let pool = sqlx::any::AnyPoolOptions::new().max_connections(1).connect(&sqlite_url).await.expect("connect sqlite");
    let db = Db::from_any_pool(pool, didhub_server::db::DbBackend::Sqlite, sqlite_url.clone());
    let cfg = AppConfig::default_for_tests();
    let app = didhub_server::build_router(db.clone(), cfg.clone()).await;
    // register
    let _ = app.clone().oneshot(http::Request::post("/api/auth/register").header("content-type","application/json").body(Body::from(json!({"username":"changer","password":"origpass"}).to_string())).unwrap()).await.unwrap();
    // fetch health to get initial CSRF cookie
    let health = app.clone().oneshot(http::Request::get("/health").body(Body::empty()).unwrap()).await.unwrap();
    let cookie = health.headers().get("set-cookie").and_then(|v| v.to_str().ok()).unwrap_or("").to_string();
    let csrf_token = cookie.split(';').next().and_then(|p| p.split('=').nth(1)).unwrap_or("").to_string();
    // login (allowlisted from CSRF, but rotate sets new cookie)
    let res = app.clone().oneshot(http::Request::post("/api/auth/login").header("content-type","application/json").header("cookie", &cookie).header("x-csrf-token", &csrf_token).body(Body::from(json!({"username":"changer","password":"origpass"}).to_string())).unwrap()).await.unwrap();
    assert_eq!(res.status(), 200);
    let bytes = axum::body::to_bytes(res.into_body(), 1024*1024).await.unwrap();
    let v: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
    let token = v.get("token").and_then(|t| t.as_str()).unwrap().to_string();
    (app, token)
}

#[tokio::test]
async fn change_password_flow() {
    let (app, token) = setup().await;
    // fetch fresh CSRF after login
    let health = app.clone().oneshot(http::Request::get("/health").body(Body::empty()).unwrap()).await.unwrap();
    let cookie = health.headers().get("set-cookie").and_then(|v| v.to_str().ok()).unwrap_or("").to_string();
    let csrf = cookie.split(';').next().and_then(|p| p.split('=').nth(1)).unwrap_or("").to_string();
    // wrong current password (expect 401)
    let bad = app.clone().oneshot(http::Request::post("/api/me/password").header("content-type","application/json").header("authorization", format!("Bearer {}", token)).header("cookie", &cookie).header("x-csrf-token", &csrf).body(Body::from(json!({"current_password":"bad","new_password":"newpass123"}).to_string())).unwrap()).await.unwrap();
    assert_eq!(bad.status(), http::StatusCode::UNAUTHORIZED);
    // correct
    // correct
    let ok = app.clone().oneshot(http::Request::post("/api/me/password").header("content-type","application/json").header("authorization", format!("Bearer {}", token)).header("cookie", &cookie).header("x-csrf-token", &csrf).body(Body::from(json!({"current_password":"origpass","new_password":"newpass123"}).to_string())).unwrap()).await.unwrap();
    assert_eq!(ok.status(), http::StatusCode::OK);
    // login with old should fail
    let old_login = app.clone().oneshot(http::Request::post("/api/auth/login").header("content-type","application/json").body(Body::from(json!({"username":"changer","password":"origpass"}).to_string())).unwrap()).await.unwrap();
    assert_eq!(old_login.status(), http::StatusCode::UNAUTHORIZED);
    // login with new should succeed
    let new_login = app.clone().oneshot(http::Request::post("/api/auth/login").header("content-type","application/json").body(Body::from(json!({"username":"changer","password":"newpass123"}).to_string())).unwrap()).await.unwrap();
    assert_eq!(new_login.status(), http::StatusCode::OK);
}
