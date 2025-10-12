use didhub_server::{db::Db, config::AppConfig};
use axum::{Router, body::Body};
use axum::http;
use axum::body;
use tower::ServiceExt;
use serde_json::json;

fn test_cfg() -> AppConfig { AppConfig::default_for_tests() }

async fn bootstrap(username: &str) -> (Router, Db, String) {
    let db_file = format!("test-db-systems-{}.sqlite", uuid::Uuid::new_v4());
        let db_file = format!("test-db-systems-{}.sqlite", uuid::Uuid::new_v4());
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
    let app_components = didhub_server::build_app(db.clone(), cfg.clone()).await;
    let app = app_components.router;
    // register
    let body = json!({"username":username, "password":"pass123"});
    let res = app.clone().oneshot(http::Request::post("/api/auth/register").header("content-type","application/json").body(Body::from(body.to_string())).unwrap()).await.unwrap();
    assert_eq!(res.status(), 200);
    // login
    let body = json!({"username":username, "password":"pass123"});
    let res = app.clone().oneshot(http::Request::post("/api/auth/login").header("content-type","application/json").body(Body::from(body.to_string())).unwrap()).await.unwrap();
    assert_eq!(res.status(), 200);
    let bytes = body::to_bytes(res.into_body(), 1024*1024).await.unwrap();
    let v: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
    let token = v.get("token").and_then(|t| t.as_str()).unwrap().to_string();
    (app, db, token)
}

#[tokio::test]
async fn systems_list_and_detail() {
    let (app, _db, token) = bootstrap("sysuser1").await;
    // create some alters and a group, subsystem
    for i in 0..3 {
        let payload = json!({"name": format!("Alt{}", i)});
        let res = app.clone().oneshot(http::Request::post("/api/alters").header("authorization", format!("Bearer {}", token)).header("content-type","application/json").body(Body::from(payload.to_string())).unwrap()).await.unwrap();
        assert_eq!(res.status(), 200);
    }
    // create group
    let g = json!({"name":"GroupX"});
    let res = app.clone().oneshot(http::Request::post("/api/groups").header("authorization", format!("Bearer {}", token)).header("content-type","application/json").body(Body::from(g.to_string())).unwrap()).await.unwrap();
    assert_eq!(res.status(), 201);
    // create subsystem
    let s = json!({"name":"SubX"});
    let res = app.clone().oneshot(http::Request::post("/api/subsystems").header("authorization", format!("Bearer {}", token)).header("content-type","application/json").body(Body::from(s.to_string())).unwrap()).await.unwrap();
    assert_eq!(res.status(), 201);
    // list systems
    let res = app.clone().oneshot(http::Request::get("/api/systems").header("authorization", format!("Bearer {}", token)).body(Body::empty()).unwrap()).await.unwrap();
    assert_eq!(res.status(), 200);
    let bytes = body::to_bytes(res.into_body(), 1024*1024).await.unwrap();
    let v: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
    assert!(v.get("items").unwrap().as_array().unwrap().len() >= 1);
    // detail
    let user_id = v.get("items").unwrap().as_array().unwrap()[0].get("user_id").unwrap().as_str().unwrap().to_string();
    let res = app.clone().oneshot(http::Request::get(format!("/api/systems/{}", user_id)).header("authorization", format!("Bearer {}", token)).body(Body::empty()).unwrap()).await.unwrap();
    assert_eq!(res.status(), 200);
    let bytes = body::to_bytes(res.into_body(), 1024*1024).await.unwrap();
    let detail: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(detail.get("alters").unwrap().as_array().unwrap().len(), 3);
}