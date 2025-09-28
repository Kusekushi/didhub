use didhub_server::{build_router, config::AppConfig, db::{Db, UpdateUserFields}};
use axum::{body::{Body, self}, http::{Request, StatusCode}};
use tower::util::ServiceExt; // oneshot
use serde_json::json;
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
async fn auth_register_login_and_me() {
    let db_path = format!("test-{}.db", uuid::Uuid::new_v4());
    if std::path::Path::new(&db_path).exists() { let _ = std::fs::remove_file(&db_path); }
    if let Some(p) = std::path::Path::new(&db_path).parent() { std::fs::create_dir_all(p).ok(); }
    let _ = std::fs::OpenOptions::new().create(true).write(true).open(&db_path).expect("create sqlite file");
    let sqlite_url = format!("sqlite://{}", db_path.replace('\\', "/"));
    // Ensure sqlx Any drivers are installed and migrations are applied for the test DB
    sqlx::any::install_default_drivers();
    let pool = sqlx::any::AnyPoolOptions::new().max_connections(1).connect(&sqlite_url).await.expect("connect sqlite");
    sqlite_migrator().run(&pool).await.expect("run migrations");
    let db = Db::from_any_pool(pool, didhub_server::db::DbBackend::Sqlite, sqlite_url.clone());
    let cfg = test_cfg();
    let app = build_router(db.clone(), cfg).await;

    let token = register_and_login(&db, &app, "auth_user", "pw", true).await;

    // login explicit
    let (st_login, _login_body) = auth_req(&app, axum::http::Method::POST, "/api/auth/login", &token, Some(json!({"username":"auth_user","password":"pw"}))).await;
    // login via token returned as if registering; status OK
    assert_eq!(st_login, StatusCode::OK);

    // call /api/me
    let (st_me, me_body) = auth_req(&app, axum::http::Method::GET, "/api/me", &token, None).await;
    assert_eq!(st_me, StatusCode::OK);
    assert_eq!(me_body["username"], json!("auth_user"));
}

#[tokio::test]
async fn admin_user_routes() {
    let db_path = format!("test-{}.db", uuid::Uuid::new_v4());
    if std::path::Path::new(&db_path).exists() { let _ = std::fs::remove_file(&db_path); }
    if std::path::Path::new(&db_path).exists() { let _ = std::fs::remove_file(&db_path); }
    if let Some(p) = std::path::Path::new(&db_path).parent() { std::fs::create_dir_all(p).ok(); }
    let _ = std::fs::OpenOptions::new().create(true).write(true).open(&db_path).expect("create sqlite file");
    sqlx::any::install_default_drivers();
    let db = Db::connect_with_file(&db_path).await.expect("connect sqlite");
    let cfg = test_cfg();
    let app = build_router(db.clone(), cfg).await;

    // create admin and regular user
    let token_admin = register_and_login(&db, &app, "admin_u", "pw", true).await;
    let _token_user = register_and_login(&db, &app, "plain_u", "pw", true).await;

    // promote admin
    let au = db.fetch_user_by_username("admin_u").await.unwrap().unwrap();
    let mut f = UpdateUserFields::default(); f.is_admin = Some(true); f.is_approved = Some(true); db.update_user(au.id, f).await.unwrap();

    // re-login to obtain a token that reflects admin privileges
    let health_rl = app.clone().oneshot(Request::get("/health").body(Body::empty()).unwrap()).await.unwrap();
    let cookie_rl = health_rl.headers().get("set-cookie").map(|h| h.to_str().unwrap().to_string()).unwrap_or_default();
    let csrf_rl = cookie_rl.split(';').next().unwrap_or("").split('=').nth(1).unwrap_or("").to_string();
    let login_body = json!({"username":"admin_u","password":"pw"});
    let resp_rl = app.clone().oneshot(Request::post("/api/auth/login").header("content-type","application/json").header("cookie", &cookie_rl).header("x-csrf-token", &csrf_rl).body(Body::from(login_body.to_string())).unwrap()).await.unwrap();
    assert_eq!(resp_rl.status(), StatusCode::OK);
    let rl_bytes = body::to_bytes(resp_rl.into_body(), 64 * 1024).await.unwrap();
    let rl_v: serde_json::Value = serde_json::from_slice(&rl_bytes).unwrap();
    let token_admin = rl_v["token"].as_str().unwrap().to_string();

    // admin lists users
    let (sl, users_body) = auth_req(&app, axum::http::Method::GET, "/api/users", &token_admin, None).await;
    assert_eq!(sl, StatusCode::OK);
    assert!(users_body["items"].as_array().unwrap().len() >= 2);

    // get specific user
    let user = db.fetch_user_by_username("plain_u").await.unwrap().unwrap();
    let (sg, got) = auth_req(&app, axum::http::Method::GET, &format!("/api/users/{}", user.id), &token_admin, None).await;
    assert_eq!(sg, StatusCode::OK);
    assert_eq!(got["username"], json!("plain_u"));

    // update user (approve)
    let (su, updated) = auth_req(&app, axum::http::Method::PUT, &format!("/api/users/{}", user.id), &token_admin, Some(json!({"is_approved": true}))).await;
    assert_eq!(su, StatusCode::OK);
    assert_eq!(updated["is_approved"], json!(true));

    // delete user
    let (sd, delb) = auth_req(&app, axum::http::Method::DELETE, &format!("/api/users/{}", user.id), &token_admin, None).await;
    assert_eq!(sd, StatusCode::OK);
    assert_eq!(delb["deleted"], json!(true));
}
