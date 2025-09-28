use didhub_server::{build_router, config::AppConfig, db::Db, logging};
use axum::{body::{Body, self}, http::Request};
use tower::ServiceExt;
use axum::http::StatusCode;

async fn setup() -> (axum::Router, String, String) {
    logging::init(false);
    let db_file = format!("test-db-pdf-{}.sqlite", uuid::Uuid::new_v4());
    let sqlite_url = format!("sqlite://{}", db_file.replace('\\',"/"));
    if std::path::Path::new(&db_file).exists() { let _ = std::fs::remove_file(&db_file); }
    if let Some(p) = std::path::Path::new(&db_file).parent() { std::fs::create_dir_all(p).ok(); }
    let _ = std::fs::OpenOptions::new().create(true).write(true).open(&db_file).expect("create sqlite file");
    sqlx::any::install_default_drivers();
    let pool = sqlx::any::AnyPoolOptions::new().max_connections(1).connect(&sqlite_url).await.expect("connect sqlite");
    let db = Db::from_any_pool(pool, didhub_server::db::DbBackend::Sqlite, sqlite_url.clone());
    let cfg = AppConfig::default_for_tests();
    let router = build_router(db.clone(), cfg.clone()).await;
    let payload = serde_json::json!({"username":"pdfuser","password":"pw","is_system":true});
    let res = router.clone().oneshot(Request::builder().method("POST").uri("/api/auth/register")
        .header("content-type","application/json")
        .body(Body::from(payload.to_string())).unwrap()).await.unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    let body_bytes = body::to_bytes(res.into_body(), 1024*1024).await.unwrap();
    let v: serde_json::Value = serde_json::from_slice(&body_bytes).unwrap();
    let token = v.get("token").and_then(|t| t.as_str()).unwrap().to_string();
    let health = router.clone().oneshot(Request::get("/health").body(Body::empty()).unwrap()).await.unwrap();
    let cookie = health.headers().get("set-cookie").map(|h| h.to_str().unwrap().to_string()).unwrap_or_default();
    (router, token, cookie)
}

#[tokio::test]
async fn pdf_endpoints_basic() {
    let (router, token, cookie) = setup().await;
    let csrf = cookie.split(';').next().unwrap_or("").split('=').nth(1).unwrap_or("").to_string();
    // Create a group to have a target for PDF export
    let create = serde_json::json!({"name":"PDFGroup","description":"desc"});
    let res = router.clone().oneshot(Request::builder().method("POST").uri("/api/groups")
        .header("content-type","application/json")
        .header("authorization", format!("Bearer {}", token))
        .header("cookie", &cookie)
        .header("x-csrf-token", &csrf)
        .body(Body::from(create.to_string())).unwrap()).await.unwrap();
    assert_eq!(res.status(), StatusCode::CREATED);
    let body_bytes = body::to_bytes(res.into_body(), 1024*1024).await.unwrap();
    let v: serde_json::Value = serde_json::from_slice(&body_bytes).unwrap();
    let gid = v.get("id").unwrap().as_i64().unwrap();

    // Export group PDF
    let res = router.clone().oneshot(Request::builder().method("GET").uri(format!("/api/pdf/group/{}", gid))
        .header("authorization", format!("Bearer {}", token))
        .body(Body::empty()).unwrap()).await.unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    let ct = res.headers().get("content-type").unwrap().to_str().unwrap();
    assert_eq!(ct, "application/pdf");

    // 404 for nonexistent alter
    let res = router.clone().oneshot(Request::builder().method("GET").uri("/api/pdf/alter/999999")
        .header("authorization", format!("Bearer {}", token))
        .body(Body::empty()).unwrap()).await.unwrap();
    assert_eq!(res.status(), StatusCode::NOT_FOUND);
}
