use didhub_server::{config::AppConfig, db::Db};
use axum::{body::Body, http::Request};
use tower::util::ServiceExt;
use serde_json::json;
use axum::http::StatusCode;

fn test_cfg() -> AppConfig { let mut c = AppConfig::default_for_tests(); c.jwt_secret = "testsecret".into(); c }

async fn post_json(app: &axum::Router, path: &str, body: serde_json::Value) -> (StatusCode, serde_json::Value) {
    let req = Request::post(path).header("content-type","application/json").body(Body::from(body.to_string())).unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    let status = resp.status();
    let bytes = axum::body::to_bytes(resp.into_body(), 64 * 1024).await.unwrap();
    let v = if bytes.is_empty() { serde_json::json!({}) } else { serde_json::from_slice(&bytes).unwrap_or(json!({"raw": String::from_utf8_lossy(&bytes)})) };
    (status, v)
}

#[tokio::test]
async fn register_duplicate_fails() {
    let db_path = format!("test-{}.db", uuid::Uuid::new_v4());
    if std::path::Path::new(&db_path).exists() { let _ = std::fs::remove_file(&db_path); }
    let db = Db::connect_with_file(&db_path).await.unwrap();
    let cfg = test_cfg();
    let app_components = didhub_server::build_app(db.clone(), cfg).await;
    let app = app_components.router;

    let payload = json!({"username":"dup_user","password":"pw"});
    let (s1, _) = post_json(&app, "/api/auth/register", payload.clone()).await;
    assert_eq!(s1, StatusCode::OK);
    let (s2, body2) = post_json(&app, "/api/auth/register", payload.clone()).await;
    assert_eq!(s2, StatusCode::BAD_REQUEST);
    assert!(body2["error"].as_str().unwrap().contains("user exists"));
}

#[tokio::test]
async fn login_wrong_password_fails() {
    let db_path = format!("test-{}.db", uuid::Uuid::new_v4());
    if std::path::Path::new(&db_path).exists() { let _ = std::fs::remove_file(&db_path); }
    let db = Db::connect_with_file(&db_path).await.unwrap();
    let cfg = test_cfg();
    let app_components = didhub_server::build_app(db.clone(), cfg).await;
    let app = app_components.router;

    let _ = post_json(&app, "/api/auth/register", json!({"username":"lp","password":"right"})).await;
    let (s, b) = post_json(&app, "/api/auth/login", json!({"username":"lp","password":"wrong"})).await;
    assert_eq!(s, StatusCode::UNAUTHORIZED);
    assert!(b["error"].as_str().unwrap().contains("auth required") || b["error"].as_str().unwrap().contains("unauthorized") );
}

#[tokio::test]
async fn access_protected_without_token_fails() {
    let db_path = format!("test-{}.db", uuid::Uuid::new_v4());
    if std::path::Path::new(&db_path).exists() { let _ = std::fs::remove_file(&db_path); }
    let db = Db::connect_with_file(&db_path).await.unwrap();
    let cfg = test_cfg();
    let app_components = didhub_server::build_app(db.clone(), cfg).await;
    let app = app_components.router;

    let req = Request::get("/api/me").body(Body::empty()).unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn invalid_token_fails() {
    let db_path = format!("test-{}.db", uuid::Uuid::new_v4());
    if std::path::Path::new(&db_path).exists() { let _ = std::fs::remove_file(&db_path); }
    let db = Db::connect_with_file(&db_path).await.unwrap();
    let cfg = test_cfg();
    let app_components = didhub_server::build_app(db.clone(), cfg).await;
    let app = app_components.router;

    let req = Request::get("/api/me").header("authorization","Bearer bad.token.here").body(Body::empty()).unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::UNAUTHORIZED);
}
