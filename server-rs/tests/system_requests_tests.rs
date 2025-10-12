use didhub_server::{config::AppConfig, db::Db};
use axum::{Router, body::Body, http::{Request, StatusCode}};
use http_body_util::BodyExt; // for collect
use tower::ServiceExt; // for oneshot
use serde_json::json;

async fn test_ctx() -> (Router, Db) {
    // tracing optional
    let db_file = format!("test-db-{}.sqlite", uuid::Uuid::new_v4());
    if std::path::Path::new(&db_file).exists() { let _ = std::fs::remove_file(&db_file); }
    if let Some(p) = std::path::Path::new(&db_file).parent() { std::fs::create_dir_all(p).ok(); }
    let _ = std::fs::OpenOptions::new().create(true).write(true).open(&db_file).expect("create sqlite file");
    let sqlite_url = format!("sqlite://{}", db_file.replace('\\', "/"));
    sqlx::any::install_default_drivers();
    // Ensure file exists on Windows and install SQLx Any drivers
    if std::path::Path::new(&db_file).exists() { let _ = std::fs::remove_file(&db_file); }
    if let Some(p) = std::path::Path::new(&db_file).parent() { std::fs::create_dir_all(p).ok(); }
    let _ = std::fs::OpenOptions::new().create(true).write(true).open(&db_file).expect("create sqlite file");
    sqlx::any::install_default_drivers();
    let pool = sqlx::any::AnyPoolOptions::new().max_connections(1).connect(&sqlite_url).await.expect("connect sqlite");
    let db = Db::from_any_pool(pool, didhub_server::db::DbBackend::Sqlite, sqlite_url.clone());
    let mut cfg = AppConfig::default_for_tests();
    cfg.bootstrap_admin_username = Some("admin".into());
    cfg.bootstrap_admin_password = Some("adminpw".into());
    db.ensure_bootstrap_admin(&cfg).await.unwrap();
    let app_components = didhub_server::build_app(db.clone(), cfg).await;
    let router = app_components.router;
    (router, db)
}

#[tokio::test]
async fn system_request_flow() {
    let (app, _db) = test_ctx().await;
    // register normal user
    let reg = Request::builder().method("POST").uri("/api/auth/register").header("content-type","application/json").body(Body::from(json!({"username":"user1","password":"pass1"}).to_string())).unwrap();
    let resp = app.clone().oneshot(reg).await.unwrap();
    assert_eq!(resp.status(), StatusCode::CREATED);
    // login user
    let login = Request::builder().method("POST").uri("/api/auth/login").header("content-type","application/json").body(Body::from(json!({"username":"user1","password":"pass1"}).to_string())).unwrap();
    let resp = app.clone().oneshot(login).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
    let body_bytes = resp.into_body().collect().await.unwrap().to_bytes();
    let v: serde_json::Value = serde_json::from_slice(&body_bytes).unwrap();
    let token = v.get("token").and_then(|t| t.as_str()).unwrap();

    // request system
    let req = Request::builder().method("POST").uri("/api/me/request-system").header("authorization", format!("Bearer {}", token)).body(Body::empty()).unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
    let body_bytes = resp.into_body().collect().await.unwrap().to_bytes();
    let sr: serde_json::Value = serde_json::from_slice(&body_bytes).unwrap();
    assert_eq!(sr.get("status").unwrap(), "pending");

    // duplicate request returns same pending
    let dup = Request::builder().method("POST").uri("/api/me/request-system").header("authorization", format!("Bearer {}", token)).body(Body::empty()).unwrap();
    let resp = app.clone().oneshot(dup).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);

    // admin login
    let admin_login = Request::builder().method("POST").uri("/api/auth/login").header("content-type","application/json").body(Body::from(json!({"username":"admin","password":"adminpw"}).to_string())).unwrap();
    let resp = app.clone().oneshot(admin_login).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
    let body_bytes = resp.into_body().collect().await.unwrap().to_bytes();
    let v: serde_json::Value = serde_json::from_slice(&body_bytes).unwrap();
    let admin_token = v.get("token").and_then(|t| t.as_str()).unwrap();

    // list requests
    let list = Request::builder().method("GET").uri("/api/system-requests").header("authorization", format!("Bearer {}", admin_token)).body(Body::empty()).unwrap();
    let resp = app.clone().oneshot(list).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
    let body_bytes = resp.into_body().collect().await.unwrap().to_bytes();
    let arr: serde_json::Value = serde_json::from_slice(&body_bytes).unwrap();
    let first_id = arr.as_array().unwrap()[0].get("id").unwrap().as_str().unwrap().to_string();

    // approve
    let approve = Request::builder().method("POST").uri("/api/system-requests").header("authorization", format!("Bearer {}", admin_token)).header("content-type","application/json").body(Body::from(json!({"id": first_id, "approve":true,"note":"ok"}).to_string())).unwrap();
    let resp = app.clone().oneshot(approve).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
    let body_bytes = resp.into_body().collect().await.unwrap().to_bytes();
    let decided: serde_json::Value = serde_json::from_slice(&body_bytes).unwrap();
    assert_eq!(decided.get("status").unwrap(), "approved");

    // user fetch latest after approval
    let my = Request::builder().method("GET").uri("/api/me/request-system").header("authorization", format!("Bearer {}", token)).body(Body::empty()).unwrap();
    let resp = app.clone().oneshot(my).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
    let body_bytes = resp.into_body().collect().await.unwrap().to_bytes();
    let latest: serde_json::Value = serde_json::from_slice(&body_bytes).unwrap();
    assert_eq!(latest.get("status").unwrap(), "approved");
}
