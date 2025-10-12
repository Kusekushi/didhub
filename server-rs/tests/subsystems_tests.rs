use didhub_server::{db::Db, config::AppConfig};
use axum::{Router, body::Body};
use axum::http;
use axum::body;
use tower::ServiceExt; // for oneshot
use serde_json::json;

fn test_cfg() -> AppConfig { AppConfig::default_for_tests() }

async fn bootstrap() -> (Router, Db, String) {
    let db_file = format!("test-db-subsystems-{}.sqlite", uuid::Uuid::new_v4());
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
    // register user
    let body = json!({"username":"user1","password":"pass123"});
    let res = app.clone().oneshot(http::Request::post("/api/auth/register").header("content-type","application/json").body(Body::from(body.to_string())).unwrap()).await.unwrap();
    assert_eq!(res.status(), 200);
    // login
    let body = json!({"username":"user1","password":"pass123"});
    let res = app.clone().oneshot(http::Request::post("/api/auth/login").header("content-type","application/json").body(Body::from(body.to_string())).unwrap()).await.unwrap();
    assert_eq!(res.status(), 200);
    let bytes = body::to_bytes(res.into_body(), 1024*1024).await.unwrap();
    let v: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
    let token = v.get("token").and_then(|t| t.as_str()).unwrap().to_string();
    (app, db, token)
}

#[tokio::test]
async fn subsystem_lifecycle_and_members() {
    let (app, _db, token) = bootstrap().await;
    // create subsystem
    let create = json!({"name":"Sub Alpha"});
    let res = app.clone().oneshot(http::Request::post("/api/subsystems").header("authorization", format!("Bearer {}", token)).header("content-type","application/json").body(Body::from(create.to_string())).unwrap()).await.unwrap();
    assert_eq!(res.status(), 201);
    let body_bytes = body::to_bytes(res.into_body(), 1024*1024).await.unwrap();
    let created: serde_json::Value = serde_json::from_slice(&body_bytes).unwrap();
    let sid = created.get("id").and_then(|v| v.as_str()).unwrap().to_string();

    // list subsystems
    let res = app.clone().oneshot(http::Request::get("/api/subsystems").header("authorization", format!("Bearer {}", token)).body(Body::empty()).unwrap()).await.unwrap();
    assert_eq!(res.status(), 200);
    let bytes = body::to_bytes(res.into_body(), 1024*1024).await.unwrap();
    let v: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
    assert!(v.get("items").unwrap().as_array().unwrap().len() >= 1);

    // create an alter to add as member
    let alter_payload = json!({"name":"AlterOne"});
    let res = app.clone().oneshot(http::Request::post("/api/alters").header("authorization", format!("Bearer {}", token)).header("content-type","application/json").body(Body::from(alter_payload.to_string())).unwrap()).await.unwrap();
    assert_eq!(res.status(), 200);
    let bytes = body::to_bytes(res.into_body(), 1024*1024).await.unwrap();
    let alter_val: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
    let aid = alter_val.get("id").and_then(|v| v.as_str()).unwrap().to_string();

    // add member
    let res = app.clone().oneshot(http::Request::post(format!("/api/subsystems/{}/members", sid)).header("authorization", format!("Bearer {}", token)).header("content-type","application/json").body(Body::from(json!({"alter_id": aid}).to_string())).unwrap()).await.unwrap();
    assert_eq!(res.status(), 200);
    let bytes = body::to_bytes(res.into_body(), 1024*1024).await.unwrap();
    let members: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(members.get("alters").unwrap().as_array().unwrap().len(), 1);

    // remove member
    let res = app.clone().oneshot(http::Request::post(format!("/api/subsystems/{}/members", sid)).header("authorization", format!("Bearer {}", token)).header("content-type","application/json").body(Body::from(json!({"alter_id": aid, "add": false}).to_string())).unwrap()).await.unwrap();
    assert_eq!(res.status(), 200);
    let bytes = body::to_bytes(res.into_body(), 1024*1024).await.unwrap();
    let members2: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(members2.get("alters").unwrap().as_array().unwrap().len(), 0);

    // delete subsystem
    let res = app.clone().oneshot(http::Request::delete(format!("/api/subsystems/{}", sid)).header("authorization", format!("Bearer {}", token)).body(Body::empty()).unwrap()).await.unwrap();
    assert_eq!(res.status(), 204);
    // ensure get returns 404
    let res = app.clone().oneshot(http::Request::get(format!("/api/subsystems/{}", sid)).header("authorization", format!("Bearer {}", token)).body(Body::empty()).unwrap()).await.unwrap();
    assert_eq!(res.status(), 404);
}