use didhub_server::{db::Db, config::AppConfig, build_router};
use axum::http::{Request, StatusCode};
use axum::body::Body;
use tower::ServiceExt;
use http_body_util::BodyExt;

async fn setup() -> (Db, AppConfig, axum::Router) {
    let db_file = format!("test-data/oidc-{}.sqlite", uuid::Uuid::new_v4());
    if std::path::Path::new(&db_file).exists() { let _ = std::fs::remove_file(&db_file); }
    if let Some(p) = std::path::Path::new(&db_file).parent() { std::fs::create_dir_all(p).ok(); }
    let _ = std::fs::OpenOptions::new().create(true).write(true).open(&db_file).expect("create sqlite file");
    sqlx::any::install_default_drivers();
    let db = Db::connect_with_file(&db_file).await.expect("connect sqlite");
    let cfg = AppConfig::default_for_tests();
    let app = build_router(db.clone(), cfg.clone()).await;
    (db, cfg, app)
}

async fn register_admin(app: &axum::Router, db: &Db) -> String {
    // Register
    let reg = Request::builder().method("POST").uri("/api/auth/register")
        .header("content-type", "application/json")
        .body(Body::from("{\"username\":\"adminoidc\",\"password\":\"pw\"}"))
        .unwrap();
    let reg_resp = app.clone().oneshot(reg).await.unwrap();
    assert_eq!(reg_resp.status(), StatusCode::OK);
    // Escalate
    sqlx::query("UPDATE users SET is_admin=1, is_approved=1 WHERE username='adminoidc'").execute(&db.pool).await.unwrap();
    // Perform login so auth middleware re-fetches and sets admin flag
    let login = Request::builder().method("POST").uri("/api/auth/login")
        .header("content-type", "application/json")
        .body(Body::from("{\"username\":\"adminoidc\",\"password\":\"pw\"}"))
        .unwrap();
    let login_resp = app.clone().oneshot(login).await.unwrap();
    assert_eq!(login_resp.status(), StatusCode::OK);
    let bytes = http_body_util::BodyExt::collect(login_resp.into_body()).await.unwrap().to_bytes();
    let v: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
    v["token"].as_str().unwrap().to_string()
}

#[tokio::test]
async fn list_oidc_providers() {
    let (db, _cfg, app) = setup().await;
    let token = register_admin(&app, &db).await;
    let req = Request::builder().method("GET").uri("/api/oidc")
        .header("authorization", format!("Bearer {}", token))
        .body(Body::empty()).unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
    let body = resp.into_body().collect().await.unwrap().to_bytes();
    let v: serde_json::Value = serde_json::from_slice(&body).unwrap();
    assert!(v.as_array().unwrap().iter().any(|p| p["id"]=="google"));
}

#[tokio::test]
async fn enable_oidc_provider() {
    let (db, _cfg, app) = setup().await;
    let token = register_admin(&app, &db).await;
    // Fetch CSRF cookie
    let health = Request::builder().method("GET").uri("/health")
        .header("authorization", format!("Bearer {}", token))
        .body(Body::empty()).unwrap();
    let hresp = app.clone().oneshot(health).await.unwrap();
    let set_cookie = hresp.headers().get("set-cookie").unwrap().to_str().unwrap();
    let csrf_cookie_pair = set_cookie.split(';').next().unwrap();
    let csrf_value = csrf_cookie_pair.split('=').nth(1).unwrap();
    let req = Request::builder().method("POST").uri("/api/oidc/github/enabled")
        .header("authorization", format!("Bearer {}", token))
        .header("content-type", "application/json")
        .header("cookie", csrf_cookie_pair)
        .header("X-CSRF-Token", csrf_value)
        .body(Body::from("{\"enabled\":true}"))
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
    let body = resp.into_body().collect().await.unwrap().to_bytes();
    let v: serde_json::Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(v["id"], "github");
    assert_eq!(v["enabled"], true);
}
