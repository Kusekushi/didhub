use didhub_server::{build_router, config::AppConfig, db::Db, logging};
use axum::{body::{Body, self}, http::Request};
use tower::ServiceExt;
use axum::http::StatusCode;

async fn setup() -> (axum::Router, String) {
    logging::init(false);
    let db_file = format!("test-db-oidc-{}.sqlite", uuid::Uuid::new_v4());
        if std::path::Path::new(&db_file).exists() { let _ = std::fs::remove_file(&db_file); }
        if let Some(p) = std::path::Path::new(&db_file).parent() { std::fs::create_dir_all(p).ok(); }
        let _ = std::fs::OpenOptions::new().create(true).write(true).open(&db_file).expect("create sqlite file");
        sqlx::any::install_default_drivers();
        let db = Db::connect_with_file(&db_file).await.expect("connect sqlite");
    let cfg = AppConfig::default_for_tests();
    let router = build_router(db.clone(), cfg.clone()).await;
    let payload = serde_json::json!({"username":"adminoidc","password":"pw","is_system":true});
    let res = router.clone().oneshot(Request::builder().method("POST").uri("/api/auth/register")
        .header("content-type","application/json")
        .body(Body::from(payload.to_string())).unwrap()).await.unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    let bytes = body::to_bytes(res.into_body(), 1024*1024).await.unwrap();
    let v: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
    let token = v.get("token").and_then(|t| t.as_str()).unwrap().to_string();
    (router, token)
}

#[tokio::test]
async fn oidc_placeholder_endpoints() {
    let (router, token) = setup().await;
    let res = router.clone().oneshot(Request::builder().method("GET").uri("/api/oidc/google/authorize")
        .header("authorization", format!("Bearer {}", token))
        .body(Body::empty()).unwrap()).await.unwrap();
    assert_eq!(res.status(), StatusCode::SEE_OTHER);
    let loc = res.headers().get("location").unwrap().to_str().unwrap();
    // extract state param
    let state_param = loc.split('&').find(|p| p.contains("state=")).unwrap();
    let state_val = state_param.split('=').nth(1).unwrap();
    let callback_uri = format!("/api/oidc/google/callback?code=dummy_code&state={}", state_val);
    let res_ok = router.clone().oneshot(Request::builder().method("GET").uri(&callback_uri)
        .header("authorization", format!("Bearer {}", token))
        .body(Body::empty()).unwrap()).await.unwrap();
    assert_eq!(res_ok.status(), StatusCode::NOT_IMPLEMENTED);
    // Reusing state should now fail (already taken)
    let res_reuse = router.clone().oneshot(Request::builder().method("GET").uri(&callback_uri)
        .header("authorization", format!("Bearer {}", token))
        .body(Body::empty()).unwrap()).await.unwrap();
    assert_eq!(res_reuse.status(), StatusCode::BAD_REQUEST);
    // Invalid state
    let res_bad = router.clone().oneshot(Request::builder().method("GET").uri("/api/oidc/google/callback?code=abc&state=nonexistent")
        .header("authorization", format!("Bearer {}", token))
        .body(Body::empty()).unwrap()).await.unwrap();
    assert_eq!(res_bad.status(), StatusCode::BAD_REQUEST);
}
