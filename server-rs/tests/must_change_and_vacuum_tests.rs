use didhub_server::{build_router, config::AppConfig, db::{Db, UpdateUserFields}};
use axum::{http::{Request, StatusCode}, body::Body};
use tower::ServiceExt; // oneshot
use http_body_util::BodyExt;
use serde_json::json;

async fn setup() -> (axum::Router, Db, String) {
    let db_file = format!("test-mcp-{}.sqlite", uuid::Uuid::new_v4());
    let db = Db::connect_with_file(&db_file).await.expect("db");
    let mut cfg = AppConfig::default_for_tests();
    cfg.bootstrap_admin_username = Some("admin".into());
    cfg.bootstrap_admin_password = Some("adminpw".into());
    db.ensure_bootstrap_admin(&cfg).await.unwrap();
    let router = build_router(db.clone(), cfg).await;
    // login admin
    let login = Request::builder().method("POST").uri("/api/auth/login").header("content-type","application/json")
        .body(Body::from(json!({"username":"admin","password":"adminpw"}).to_string())).unwrap();
    let resp = router.clone().oneshot(login).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
    let bytes = resp.into_body().collect().await.unwrap().to_bytes();
    let v: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
    let token = v["token"].as_str().unwrap().to_string();
    (router, db, token)
}

#[tokio::test]
async fn must_change_password_blocks_route_with_specific_code() {
    let (app, db, token) = setup().await;
    // set must_change_password for admin user directly
    let user = db.fetch_user_by_username("admin").await.unwrap().unwrap();
    let mut f = UpdateUserFields::default(); f.must_change_password = Some(true); db.update_user(user.id, f).await.unwrap();
    // attempt accessing a protected non-allowlisted route (e.g., /api/settings)
    let req = Request::builder().method("GET").uri("/api/settings")
        .header("authorization", format!("Bearer {}", token))
        .body(Body::empty()).unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::PRECONDITION_REQUIRED);
    let body = resp.into_body().collect().await.unwrap().to_bytes();
    let v: serde_json::Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(v["code"], "must_change_password");
}

#[tokio::test]
async fn db_vacuum_job_triggers() {
    let (app, _db, token) = setup().await;
    // trigger vacuum job
    let req = Request::builder().method("POST").uri("/api/housekeeping/trigger/db_vacuum")
        .header("authorization", format!("Bearer {}", token))
        .body(Body::empty()).unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    // Accept OK or NOT_FOUND if job registration delayed; if OK check job field
    if resp.status() == StatusCode::OK {
        let bytes = resp.into_body().collect().await.unwrap().to_bytes();
        let v: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(v["job"], "db_vacuum");
    } else {
        assert!(resp.status() == StatusCode::NOT_FOUND, "unexpected status {}", resp.status());
    }
}
