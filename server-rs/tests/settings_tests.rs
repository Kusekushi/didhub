use didhub_server::{config::AppConfig, db::Db};
use axum::{Router, body::Body, http::{Request, StatusCode}};
use http_body_util::BodyExt; // for collect
use tower::ServiceExt; // for oneshot
use serde_json::json;

async fn test_ctx() -> (Router, Db) {
    let db_file = format!("test-db-{}.sqlite", uuid::Uuid::new_v4());
    if std::path::Path::new(&db_file).exists() { let _ = std::fs::remove_file(&db_file); }
    if let Some(p) = std::path::Path::new(&db_file).parent() { std::fs::create_dir_all(p).ok(); }
    let _ = std::fs::OpenOptions::new().create(true).write(true).open(&db_file).expect("create sqlite file");
    sqlx::any::install_default_drivers();
    if std::path::Path::new(&db_file).exists() { let _ = std::fs::remove_file(&db_file); }
    if let Some(p) = std::path::Path::new(&db_file).parent() { std::fs::create_dir_all(p).ok(); }
    let _ = std::fs::OpenOptions::new().create(true).write(true).open(&db_file).expect("create sqlite file");
    sqlx::any::install_default_drivers();
    let db = Db::connect_with_file(&db_file).await.expect("connect sqlite");
    let mut cfg = AppConfig::default_for_tests();
    cfg.bootstrap_admin_username = Some("admin".into());
    cfg.bootstrap_admin_password = Some("adminpw".into());
    db.ensure_bootstrap_admin(&cfg).await.unwrap();
    let app_components = didhub_server::build_app(db.clone(), cfg).await;
    let router = app_components.router;
    (router, db)
}

#[tokio::test]
async fn settings_crud_flow() {
    let (app, _db) = test_ctx().await;
    // initial health for csrf
    let health = Request::get("/health").body(Body::empty()).unwrap();
    let health_resp = app.clone().oneshot(health).await.unwrap();
    let base_cookie = health_resp.headers().get("set-cookie").and_then(|v| v.to_str().ok()).unwrap_or("").to_string();
    let base_csrf = base_cookie.split(';').next().and_then(|p| p.split('=').nth(1)).unwrap_or("").to_string();
    // admin login
    let admin_login = Request::builder().method("POST").uri("/api/auth/login").header("content-type","application/json").header("cookie", &base_cookie).header("x-csrf-token", &base_csrf).body(Body::from(json!({"username":"admin","password":"adminpw"}).to_string())).unwrap();
    let resp = app.clone().oneshot(admin_login).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
    let body_bytes = resp.into_body().collect().await.unwrap().to_bytes();
    let v: serde_json::Value = serde_json::from_slice(&body_bytes).unwrap();
    let admin_token = v.get("token").and_then(|t| t.as_str()).unwrap();

    // put a setting
    // refresh csrf for mutating requests
    let health2 = app.clone().oneshot(Request::get("/health").body(Body::empty()).unwrap()).await.unwrap();
    let cookie2 = health2.headers().get("set-cookie").and_then(|v| v.to_str().ok()).unwrap_or("").to_string();
    let csrf2 = cookie2.split(';').next().and_then(|p| p.split('=').nth(1)).unwrap_or("").to_string();
    let put_1 = Request::builder().method("PUT").uri("/api/settings/site.title").header("authorization", format!("Bearer {}", admin_token)).header("content-type","application/json").header("cookie", &cookie2).header("x-csrf-token", &csrf2).body(Body::from(json!({"value":"DIDHub"}).to_string())).unwrap();
    let resp = app.clone().oneshot(put_1).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);

    // overwrite with object
    let health3 = app.clone().oneshot(Request::get("/health").body(Body::empty()).unwrap()).await.unwrap();
    let cookie3 = health3.headers().get("set-cookie").and_then(|v| v.to_str().ok()).unwrap_or("").to_string();
    let csrf3 = cookie3.split(';').next().and_then(|p| p.split('=').nth(1)).unwrap_or("").to_string();
    let put_2 = Request::builder().method("PUT").uri("/api/settings/feature.flags").header("authorization", format!("Bearer {}", admin_token)).header("content-type","application/json").header("cookie", &cookie3).header("x-csrf-token", &csrf3).body(Body::from(json!({"value":{"beta":true}}).to_string())).unwrap();
    let resp = app.clone().oneshot(put_2).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);

    // list
    let list = Request::builder().method("GET").uri("/api/settings").header("authorization", format!("Bearer {}", admin_token)).body(Body::empty()).unwrap();
    let resp = app.clone().oneshot(list).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
    let body_bytes = resp.into_body().collect().await.unwrap().to_bytes();
    let arr: serde_json::Value = serde_json::from_slice(&body_bytes).unwrap();
    assert!(arr.as_array().unwrap().len() >= 2);

    // get single
    let single = Request::builder().method("GET").uri("/api/settings/site.title").header("authorization", format!("Bearer {}", admin_token)).body(Body::empty()).unwrap();
    let resp = app.clone().oneshot(single).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
    let body_bytes = resp.into_body().collect().await.unwrap().to_bytes();
    let val: serde_json::Value = serde_json::from_slice(&body_bytes).unwrap();
    assert_eq!(val.get("value").unwrap(), "DIDHub");

    // non-admin forbidden
    // register user
    let reg = Request::builder().method("POST").uri("/api/auth/register").header("content-type","application/json").header("cookie", &cookie3).header("x-csrf-token", &csrf3).body(Body::from(json!({"username":"user1","password":"pw"}).to_string())).unwrap();
    let resp = app.clone().oneshot(reg).await.unwrap();
    // registration returns 200 OK (returns token) not 201
    assert_eq!(resp.status(), StatusCode::OK);
    let login = Request::builder().method("POST").uri("/api/auth/login").header("content-type","application/json").header("cookie", &cookie3).header("x-csrf-token", &csrf3).body(Body::from(json!({"username":"user1","password":"pw"}).to_string())).unwrap();
    let resp = app.clone().oneshot(login).await.unwrap();
    let body_bytes = resp.into_body().collect().await.unwrap().to_bytes();
    let v: serde_json::Value = serde_json::from_slice(&body_bytes).unwrap();
    let user_token = v.get("token").and_then(|t| t.as_str()).unwrap();

    let forbidden = Request::builder().method("GET").uri("/api/settings").header("authorization", format!("Bearer {}", user_token)).body(Body::empty()).unwrap();
    let resp = app.clone().oneshot(forbidden).await.unwrap();
    assert_eq!(resp.status(), StatusCode::FORBIDDEN);

    // validation failures (admin)
    // invalid discord webhook (not https)
    let health4 = app.clone().oneshot(Request::get("/health").body(Body::empty()).unwrap()).await.unwrap();
    let cookie4 = health4.headers().get("set-cookie").and_then(|v| v.to_str().ok()).unwrap_or("").to_string();
    let csrf4 = cookie4.split(';').next().and_then(|p| p.split('=').nth(1)).unwrap_or("").to_string();
    let admin_login2 = Request::builder().method("POST").uri("/api/auth/login").header("content-type","application/json").header("cookie", &cookie4).header("x-csrf-token", &csrf4).body(Body::from(json!({"username":"admin","password":"adminpw"}).to_string())).unwrap();
    let resp = app.clone().oneshot(admin_login2).await.unwrap();
    let body_bytes = resp.into_body().collect().await.unwrap().to_bytes();
    let v: serde_json::Value = serde_json::from_slice(&body_bytes).unwrap();
    let admin_token2 = v.get("token").and_then(|t| t.as_str()).unwrap();

    let health5 = app.clone().oneshot(Request::get("/health").body(Body::empty()).unwrap()).await.unwrap();
    let cookie5 = health5.headers().get("set-cookie").and_then(|v| v.to_str().ok()).unwrap_or("").to_string();
    let csrf5 = cookie5.split(';').next().and_then(|p| p.split('=').nth(1)).unwrap_or("").to_string();
    let bad_discord = Request::builder().method("PUT").uri("/api/settings/discord.webhook").header("authorization", format!("Bearer {}", admin_token2)).header("content-type","application/json").header("cookie", &cookie5).header("x-csrf-token", &csrf5).body(Body::from(json!({"value":"http://insecure"}).to_string())).unwrap();
    let resp = app.clone().oneshot(bad_discord).await.unwrap();
    assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
    let body_bytes = resp.into_body().collect().await.unwrap().to_bytes();
    let err: serde_json::Value = serde_json::from_slice(&body_bytes).unwrap();
    assert_eq!(err.get("code").unwrap(), "validation_failed");

    // invalid redis (missing url)
    let health6 = app.clone().oneshot(Request::get("/health").body(Body::empty()).unwrap()).await.unwrap();
    let cookie6 = health6.headers().get("set-cookie").and_then(|v| v.to_str().ok()).unwrap_or("").to_string();
    let csrf6 = cookie6.split(';').next().and_then(|p| p.split('=').nth(1)).unwrap_or("").to_string();
    let bad_redis = Request::builder().method("PUT").uri("/api/settings/redis.settings").header("authorization", format!("Bearer {}", admin_token2)).header("content-type","application/json").header("cookie", &cookie6).header("x-csrf-token", &csrf6).body(Body::from(json!({"value":{ "prefix":"x"}}).to_string())).unwrap();
    let resp = app.clone().oneshot(bad_redis).await.unwrap();
    assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
}
