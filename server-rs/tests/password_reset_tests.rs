use didhub_server::{db::Db, config::AppConfig};
use axum::{Router, body::Body};
use axum::{http, body};
use tower::ServiceExt;
use serde_json::json;

fn test_cfg() -> AppConfig { AppConfig::default_for_tests() }

async fn bootstrap() -> (Router, Db, String) {
    let db_file = format!("test-db-pr-{}.sqlite", uuid::Uuid::new_v4());
        if std::path::Path::new(&db_file).exists() { let _ = std::fs::remove_file(&db_file); }
        if let Some(p) = std::path::Path::new(&db_file).parent() { std::fs::create_dir_all(p).ok(); }
        let _ = std::fs::OpenOptions::new().create(true).write(true).open(&db_file).expect("create sqlite file");
        sqlx::any::install_default_drivers();
    if std::path::Path::new(&db_file).exists() { let _ = std::fs::remove_file(&db_file); }
    if let Some(p) = std::path::Path::new(&db_file).parent() { std::fs::create_dir_all(p).ok(); }
    let _ = std::fs::OpenOptions::new().create(true).write(true).open(&db_file).expect("create sqlite file");
    sqlx::any::install_default_drivers();
    let db = Db::connect_with_file(&db_file).await.expect("connect sqlite");
    let cfg = test_cfg();
    let app = didhub_server::build_router(db.clone(), cfg.clone()).await;
    let _ = app.clone().oneshot(http::Request::post("/api/auth/register").header("content-type","application/json").body(Body::from(json!({"username":"resetuser","password":"oldpass"}).to_string())).unwrap()).await.unwrap();
    let res = app.clone().oneshot(http::Request::post("/api/auth/login").header("content-type","application/json").body(Body::from(json!({"username":"resetuser","password":"oldpass"}).to_string())).unwrap()).await.unwrap();
    let _ = body::to_bytes(res.into_body(), 1024*1024).await.unwrap();
    (app, db, "resetuser".to_string())
}

#[tokio::test]
async fn password_reset_end_to_end() {
    let (app, _db, username) = bootstrap().await;
    // request reset
    let res = app.clone().oneshot(http::Request::post("/api/password-reset/request").header("content-type","application/json").body(Body::from(json!({"username": username}).to_string())).unwrap()).await.unwrap();
    assert_eq!(res.status(), 200);
    let bytes = body::to_bytes(res.into_body(), 1024*1024).await.unwrap();
    let v: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
    let selector = v.get("selector").and_then(|s| s.as_str()).unwrap().to_string();
    let verifier = v.get("verifier").and_then(|s| s.as_str()).unwrap().to_string();
    // verify
    let res = app.clone().oneshot(http::Request::post("/api/password-reset/verify").header("content-type","application/json").body(Body::from(json!({"selector": selector, "verifier": verifier}).to_string())).unwrap()).await.unwrap();
    assert_eq!(res.status(), 200);
    let bytes = body::to_bytes(res.into_body(), 1024*1024).await.unwrap();
    let vv: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(vv.get("valid").and_then(|b| b.as_bool()).unwrap(), true);
    // consume
    let res = app.clone().oneshot(http::Request::post("/api/password-reset/consume").header("content-type","application/json").body(Body::from(json!({"selector": selector, "verifier": verifier, "new_password": "newpass123"}).to_string())).unwrap()).await.unwrap();
    assert_eq!(res.status(), 200);
    // login with new password should work
    let res = app.clone().oneshot(http::Request::post("/api/auth/login").header("content-type","application/json").body(Body::from(json!({"username":"resetuser","password":"newpass123"}).to_string())).unwrap()).await.unwrap();
    assert_eq!(res.status(), 200);

    // fetch audit (need admin; bootstrap admin for this test separately?) For simplicity, assert at least one audit entry exists by doing a settings update as admin omitted here.
}
