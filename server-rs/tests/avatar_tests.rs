use didhub_server::{config::AppConfig, db::Db, logging};
use axum::{body::{Body, self}, http::{Request, StatusCode}};
use tower::ServiceExt;
use serde_json::Value;

async fn setup() -> (axum::Router, String) {
    logging::init(false);
    let db_file = format!("test-db-avatar-{}.sqlite", uuid::Uuid::new_v4());
    let db = Db::connect_with_file(&db_file).await.expect("connect sqlite");
    let mut cfg = AppConfig::default_for_tests();
    cfg.upload_dir = format!("uploads-test-{}", uuid::Uuid::new_v4());
    let app_components = didhub_server::build_app(db.clone(), cfg.clone()).await;
    let router = app_components.router;
    // fetch CSRF cookie/token
    let health = router.clone().oneshot(Request::get("/health").body(Body::empty()).unwrap()).await.unwrap();
    let cookie = health.headers().get("set-cookie").map(|h| h.to_str().unwrap().to_string()).unwrap_or_default();
    let csrf = cookie.split(';').next().unwrap_or("").split('=').nth(1).unwrap_or("").to_string();
    // register user
    let payload = serde_json::json!({"username":"u1","password":"pw"});
    let res = router.clone().oneshot(Request::builder().method("POST").uri("/api/auth/register")
        .header("content-type","application/json")
        .header("cookie", &cookie)
        .header("x-csrf-token", &csrf)
        .body(Body::from(payload.to_string())).unwrap()).await.unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    let body = body::to_bytes(res.into_body(), 1024*1024).await.unwrap();
    let v: Value = serde_json::from_slice(&body).unwrap();
    let token = v.get("token").and_then(|t| t.as_str()).unwrap().to_string();
    (router, token)
}

#[tokio::test]
async fn avatar_upload_and_delete() {
    let (router, token) = setup().await;
    // Build multipart body with a small file
    let boundary = "XBOUNDARY";
    let file_content = b"hello-avatar".to_vec();
    let mut body_bytes = Vec::new();
    body_bytes.extend_from_slice(format!("--{}\r\n", boundary).as_bytes());
    body_bytes.extend_from_slice(b"Content-Disposition: form-data; name=\"file\"; filename=\"avatar.png\"\r\n");
    body_bytes.extend_from_slice(b"Content-Type: application/octet-stream\r\n\r\n");
    body_bytes.extend_from_slice(&file_content);
    body_bytes.extend_from_slice(format!("\r\n--{}--\r\n", boundary).as_bytes());

    let health2 = router.clone().oneshot(Request::get("/health").body(Body::empty()).unwrap()).await.unwrap();
    let cookie2 = health2.headers().get("set-cookie").map(|h| h.to_str().unwrap().to_string()).unwrap_or_default();
    let csrf2 = cookie2.split(';').next().unwrap_or("").split('=').nth(1).unwrap_or("").to_string();

    let req = Request::builder()
        .method("POST")
        .uri("/api/me/avatar")
        .header("content-type", format!("multipart/form-data; boundary={}", boundary))
        .header("authorization", format!("Bearer {}", token))
        .header("cookie", &cookie2)
        .header("x-csrf-token", &csrf2)
        .body(Body::from(body_bytes))
        .unwrap();
    let res = router.clone().oneshot(req).await.unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    let body = body::to_bytes(res.into_body(), 1024*1024).await.unwrap();
    let v: Value = serde_json::from_slice(&body).unwrap();
    let avatar = v.get("avatar").and_then(|a| a.as_str()).unwrap();
    assert!(avatar.contains("avatar"));

    // Delete avatar
    let health3 = router.clone().oneshot(Request::get("/health").body(Body::empty()).unwrap()).await.unwrap();
    let cookie3 = health3.headers().get("set-cookie").map(|h| h.to_str().unwrap().to_string()).unwrap_or_default();
    let csrf3 = cookie3.split(';').next().unwrap_or("").split('=').nth(1).unwrap_or("").to_string();

    let req = Request::builder()
        .method("DELETE")
        .uri("/api/me/avatar")
        .header("authorization", format!("Bearer {}", token))
        .header("cookie", &cookie3)
        .header("x-csrf-token", &csrf3)
        .body(Body::empty())
        .unwrap();
    let res = router.clone().oneshot(req).await.unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    let body = body::to_bytes(res.into_body(), 1024*1024).await.unwrap();
    let v: Value = serde_json::from_slice(&body).unwrap();
    assert!(v.get("avatar").unwrap().is_null());
}
