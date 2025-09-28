use didhub_server::{db::Db, config::AppConfig};
use axum::{Router, body::Body};
use axum::{http, body};
use tower::ServiceExt;
use serde_json::json;

fn test_cfg() -> AppConfig { AppConfig::default_for_tests() }

async fn bootstrap() -> (Router, Db, String) {
    let db_file = format!("test-db-sl-{}.sqlite", uuid::Uuid::new_v4());
        let db_file = format!("test-db-shortlinks-{}.sqlite", uuid::Uuid::new_v4());
        if std::path::Path::new(&db_file).exists() { let _ = std::fs::remove_file(&db_file); }
        if let Some(p) = std::path::Path::new(&db_file).parent() { std::fs::create_dir_all(p).ok(); }
        let _ = std::fs::OpenOptions::new().create(true).write(true).open(&db_file).expect("create sqlite file");
        sqlx::any::install_default_drivers();
    if std::path::Path::new(&db_file).exists() { let _ = std::fs::remove_file(&db_file); }
    if let Some(p) = std::path::Path::new(&db_file).parent() { std::fs::create_dir_all(p).ok(); }
    let _ = std::fs::OpenOptions::new().create(true).write(true).open(&db_file).expect("create sqlite file");
    sqlx::any::install_default_drivers();
    let db = Db::connect_with_file(&db_file).await.unwrap();
    let cfg = test_cfg();
    let app = didhub_server::build_router(db.clone(), cfg.clone()).await;
    // register + login
    let body = json!({"username":"sluser","password":"pass123"});
    let _ = app.clone().oneshot(http::Request::post("/api/auth/register").header("content-type","application/json").body(Body::from(body.to_string())).unwrap()).await.unwrap();
    let res = app.clone().oneshot(http::Request::post("/api/auth/login").header("content-type","application/json").body(Body::from(json!({"username":"sluser","password":"pass123"}).to_string())).unwrap()).await.unwrap();
    let bytes = body::to_bytes(res.into_body(), 1024*1024).await.unwrap();
    let v: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
    let token = v.get("token").and_then(|t| t.as_str()).unwrap().to_string();
    (app, db, token)
}

#[tokio::test]
async fn shortlink_create_resolve_redirect() {
    let (app, _db, token) = bootstrap().await;
    // create
    let payload = json!({"target":"https://example.com/somewhere"});
    let res = app.clone().oneshot(http::Request::post("/api/shortlink").header("authorization", format!("Bearer {}", token)).header("content-type","application/json").body(Body::from(payload.to_string())).unwrap()).await.unwrap();
    assert_eq!(res.status(), 201);
    let bytes = body::to_bytes(res.into_body(), 1024*1024).await.unwrap();
    let created: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
    let token_val = created.get("token").unwrap().as_str().unwrap().to_string();

    // resolve
    let res = app.clone().oneshot(http::Request::get(format!("/api/shortlink/{}", token_val)).header("authorization", format!("Bearer {}", token)).body(Body::empty()).unwrap()).await.unwrap();
    assert_eq!(res.status(), 200);
    let bytes = body::to_bytes(res.into_body(), 1024*1024).await.unwrap();
    let got: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(got.get("target").unwrap().as_str().unwrap(), "https://example.com/somewhere");

    // public redirect
    let res = app.clone().oneshot(http::Request::get(format!("/s/{}", token_val)).body(Body::empty()).unwrap()).await.unwrap();
    let status = res.status();
    if status != 307 {
        let bytes = body::to_bytes(res.into_body(), 1024*1024).await.unwrap_or_default();
        eprintln!("redirect body: {}", String::from_utf8_lossy(&bytes));
        panic!("unexpected status: {}", status);
    }
}