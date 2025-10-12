use didhub_server::{config::AppConfig, db::{Db, UpdateUserFields}, logging};
use axum::{body::{Body, self}, http::{Request, StatusCode}};
use tower::util::ServiceExt; // oneshot
use serde_json::json;
use serde_json::Value;
use didhub_migrations::sqlite_migrator;

fn test_cfg() -> AppConfig {
    let mut cfg = AppConfig::default_for_tests();
    cfg.jwt_secret = "testsecret".into();
    cfg
}

async fn register_and_login(db: &Db, app: &axum::Router, username: &str, password: &str, approve: bool) -> String {
    // fetch CSRF cookie/token
    let health = app.clone().oneshot(Request::get("/health").body(Body::empty()).unwrap()).await.unwrap();
    let cookie = health.headers().get("set-cookie").map(|h| h.to_str().unwrap().to_string()).unwrap_or_default();
    let csrf_token = cookie.split(';').next().unwrap_or("").split('=').nth(1).unwrap_or("").to_string();
    let body = json!({"username": username, "password": password});
    let resp = app.clone().oneshot(Request::post("/api/auth/register").header("content-type","application/json").header("cookie", &cookie).header("x-csrf-token", &csrf_token).body(Body::from(body.to_string())).unwrap()).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
    // Optionally approve user to allow immediate login in tests
    if approve {
        sqlx::query("UPDATE users SET is_approved = 1 WHERE username = ?").bind(username).execute(&db.pool).await.expect("approve user");
    }
    // login (may rotate CSRF) - fetch fresh CSRF
    let health2 = app.clone().oneshot(Request::get("/health").body(Body::empty()).unwrap()).await.unwrap();
    let cookie2 = health2.headers().get("set-cookie").map(|h| h.to_str().unwrap().to_string()).unwrap_or_default();
    let csrf_token2 = cookie2.split(';').next().unwrap_or("").split('=').nth(1).unwrap_or("").to_string();
    let resp2 = app.clone().oneshot(Request::post("/api/auth/login").header("content-type","application/json").header("cookie", &cookie2).header("x-csrf-token", &csrf_token2).body(Body::from(body.to_string())).unwrap()).await.unwrap();
    assert_eq!(resp2.status(), StatusCode::OK);
    let body_bytes = body::to_bytes(resp2.into_body(), 64 * 1024).await.unwrap();
    let v: serde_json::Value = serde_json::from_slice(&body_bytes).unwrap();
    v["token"].as_str().unwrap().to_string()
}

async fn auth_req(app: &axum::Router, method: axum::http::Method, path: &str, token: &str, body: Option<serde_json::Value>) -> (StatusCode, serde_json::Value) {
    let mut builder = Request::builder().method(method.clone()).uri(path).header("authorization", format!("Bearer {}", token));
    // include CSRF cookie/header for mutating methods
    if matches!(method, axum::http::Method::POST | axum::http::Method::PUT | axum::http::Method::DELETE | axum::http::Method::PATCH) {
        let health = app.clone().oneshot(Request::get("/health").body(Body::empty()).unwrap()).await.unwrap();
        let cookie = health.headers().get("set-cookie").map(|h| h.to_str().unwrap().to_string()).unwrap_or_default();
        let csrf_token = cookie.split(';').next().unwrap_or("").split('=').nth(1).unwrap_or("").to_string();
        builder = builder.header("cookie", cookie).header("x-csrf-token", csrf_token);
    }
    let req = if let Some(b) = body { builder = builder.header("content-type","application/json"); builder.body(Body::from(b.to_string())).unwrap() } else { builder.body(Body::empty()).unwrap() };
    let resp = app.clone().oneshot(req).await.unwrap();
    let status = resp.status();
    let body_bytes = body::to_bytes(resp.into_body(), 64 * 1024).await.unwrap();
    let v: serde_json::Value = if body_bytes.is_empty() { serde_json::json!({}) } else { serde_json::from_slice(&body_bytes).unwrap_or_else(|_| json!({"raw": String::from_utf8_lossy(&body_bytes)})) };
    (status, v)
}

#[tokio::test]
async fn admin_can_create_group_for_other_user() {
    logging::init(false);
    let db_path = format!("test-{}.db", uuid::Uuid::new_v4());
    if std::path::Path::new(&db_path).exists() { let _ = std::fs::remove_file(&db_path); }
    if let Some(p) = std::path::Path::new(&db_path).parent() { std::fs::create_dir_all(p).ok(); }
    let _ = std::fs::OpenOptions::new().create(true).write(true).open(&db_path).expect("create sqlite file");
    let sqlite_url = format!("sqlite://{}", db_path.replace('\\', "/"));
    sqlx::any::install_default_drivers();
    let pool = sqlx::any::AnyPoolOptions::new().max_connections(1).connect(&sqlite_url).await.expect("connect sqlite");
    sqlite_migrator().run(&pool).await.expect("run migrations");
    let db = Db::from_any_pool(pool, didhub_server::db::DbBackend::Sqlite, sqlite_url.clone());
    let cfg = test_cfg();
    let app_components = didhub_server::build_app(db.clone(), cfg).await;
    let app = app_components.router;

    // register admin and target user
    let _tok_admin = register_and_login(&db, &app, "admin_u", "pw", true).await;
    let _tok_target = register_and_login(&db, &app, "target_u", "pw", true).await;

    // promote admin
    let au = db.fetch_user_by_username("admin_u").await.unwrap().unwrap();
    let mut f = UpdateUserFields::default(); f.is_admin = Some(true); f.is_approved = Some(true); db.update_user(au.id, f).await.unwrap();

    // re-login to obtain admin token
    let health_rl = app.clone().oneshot(Request::get("/health").body(Body::empty()).unwrap()).await.unwrap();
    let cookie_rl = health_rl.headers().get("set-cookie").map(|h| h.to_str().unwrap().to_string()).unwrap_or_default();
    let csrf_rl = cookie_rl.split(';').next().unwrap_or("").split('=').nth(1).unwrap_or("").to_string();
    let login_body = json!({"username":"admin_u","password":"pw"});
    let resp_rl = app.clone().oneshot(Request::post("/api/auth/login").header("content-type","application/json").header("cookie", &cookie_rl).header("x-csrf-token", &csrf_rl).body(Body::from(login_body.to_string())).unwrap()).await.unwrap();
    assert_eq!(resp_rl.status(), StatusCode::OK);
    let rl_bytes = body::to_bytes(resp_rl.into_body(), 64 * 1024).await.unwrap();
    let rl_v: serde_json::Value = serde_json::from_slice(&rl_bytes).unwrap();
    let token_admin = rl_v["token"].as_str().unwrap().to_string();

    let target = db.fetch_user_by_username("target_u").await.unwrap().unwrap();

    // admin creates group for target
    let (st, body) = auth_req(&app, axum::http::Method::POST, "/api/groups", &token_admin, Some(json!({"name":"AdminGroup","owner_user_id": target.id}))).await;
    assert_eq!(st, StatusCode::CREATED, "unexpected status: {:?} - body: {:?}", st, body);
    assert_eq!(body["owner_user_id"].as_str().unwrap(), target.id);
}

#[tokio::test]
async fn nonadmin_cannot_create_for_other_but_can_create_for_self() {
    logging::init(false);
    let db_path = format!("test-{}.db", uuid::Uuid::new_v4());
    if std::path::Path::new(&db_path).exists() { let _ = std::fs::remove_file(&db_path); }
    if let Some(p) = std::path::Path::new(&db_path).parent() { std::fs::create_dir_all(p).ok(); }
    let _ = std::fs::OpenOptions::new().create(true).write(true).open(&db_path).expect("create sqlite file");
    let sqlite_url = format!("sqlite://{}", db_path.replace('\\', "/"));
    sqlx::any::install_default_drivers();
    let pool = sqlx::any::AnyPoolOptions::new().max_connections(1).connect(&sqlite_url).await.expect("connect sqlite");
    sqlite_migrator().run(&pool).await.expect("run migrations");
    let db = Db::from_any_pool(pool, didhub_server::db::DbBackend::Sqlite, sqlite_url.clone());
    let cfg = test_cfg();
    let app_components = didhub_server::build_app(db.clone(), cfg).await;
    let app = app_components.router;

    // create two users
    let token_a = register_and_login(&db, &app, "user_a", "pw", true).await;
    let _token_b = register_and_login(&db, &app, "user_b", "pw", true).await;
    let user_a = db.fetch_user_by_username("user_a").await.unwrap().unwrap();
    let user_b = db.fetch_user_by_username("user_b").await.unwrap().unwrap();

    // attempt to create group for other user - should be forbidden
    let (st_forb, body_forb) = auth_req(&app, axum::http::Method::POST, "/api/groups", &token_a, Some(json!({"name":"BadGroup","owner_user_id": user_b.id}))).await;
    assert_eq!(st_forb, StatusCode::FORBIDDEN, "expected forbidden, got {:?} - {:?}