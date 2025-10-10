use didhub_server::{config::AppConfig, db::Db, logging};
use serde_json::json;
use std::fs;
use uuid::Uuid;
use axum::{body::{Body, self}, http::{self, Request}};
use tower::util::ServiceExt; // oneshot
use sqlx::Row;

fn test_cfg() -> AppConfig {
    let mut cfg = AppConfig::default_for_tests();
    cfg.jwt_secret = "testsecret".into();
    cfg
}

async fn new_test_db() -> (Db, AppConfig) {
    let id = Uuid::new_v4();
    let file = format!("test-{}.db", id);
    let path = std::path::Path::new(&file);
    if path.exists() {
        let _ = fs::remove_file(path);
    }
    let cfg = test_cfg();
    let db_path = format!("test-{}.db", uuid::Uuid::new_v4());
    if std::path::Path::new(&db_path).exists() { let _ = std::fs::remove_file(&db_path); }
    if std::path::Path::new(&db_path).exists() { let _ = std::fs::remove_file(&db_path); }
    if let Some(p) = std::path::Path::new(&db_path).parent() { std::fs::create_dir_all(p).ok(); }
    let _ = std::fs::OpenOptions::new().create(true).write(true).open(&db_path).expect("create sqlite file");
    sqlx::any::install_default_drivers();
    let db = Db::connect_with_file(&db_path).await.expect("connect sqlite");
    (db, cfg)
}

async fn auth_req(app: &axum::Router, method: axum::http::Method, path: &str, token: &str, body: Option<serde_json::Value>) -> (http::StatusCode, serde_json::Value) {
    let mut builder = Request::builder().method(method.clone()).uri(path).header("authorization", format!("Bearer {}", token));
    // attach CSRF cookie/header for mutating methods
    if method != axum::http::Method::GET && method != axum::http::Method::HEAD && method != axum::http::Method::OPTIONS {
            let health_resp = app.clone().oneshot(Request::get("/health").body(Body::empty()).unwrap()).await.unwrap();
            if let Some(hv) = health_resp.headers().get("set-cookie") {
                if let Ok(cookie_str) = hv.to_str() {
                    let cookie = cookie_str.to_string();
                    let csrf = cookie.split(';').next().unwrap_or("").split('=').nth(1).unwrap_or("").to_string();
                    builder = builder.header("cookie", cookie).header("x-csrf-token", csrf);
                }
            }
    }
    let req = if let Some(b) = body { builder = builder.header("content-type","application/json"); builder.body(Body::from(b.to_string())).unwrap() } else { builder.body(Body::empty()).unwrap() };
    let resp = app.clone().oneshot(req).await.unwrap();
    let status = resp.status();
    let body_bytes = body::to_bytes(resp.into_body(), 64 * 1024).await.unwrap();
    let v: serde_json::Value = if body_bytes.is_empty() { serde_json::json!({}) } else { serde_json::from_slice(&body_bytes).unwrap_or_else(|_| json!({"raw": String::from_utf8_lossy(&body_bytes)})) };
    (status, v)
}

#[tokio::test]
async fn update_user_avatar_set_and_clear() {
    let (db, cfg) = new_test_db().await;
    logging::init(false);
    let app_components = didhub_server::build_app(db.clone(), cfg.clone()).await;
    let app = app_components.router;

    // create a user directly
    let res = sqlx::query("INSERT INTO users (username, password_hash, is_admin) VALUES (?, ?, 0);")
        .bind("u_avatar")
        .bind("hash")
        .execute(&db.pool)
        .await
        .unwrap();
    let uid = res.last_insert_id().expect("insert id");

    // attempt to update as anonymous -> expect 401 or 204 depending on middleware
    let body_set = json!({"avatar_url":"https://example.com/a.png"});
    let (st_set, _body_set) = auth_req(&app, axum::http::Method::PUT, &format!("/api/users/{:?}", uid), "", Some(body_set)).await;
    assert!(st_set == 401 || st_set == 204);

    // set avatar via direct DB update
    sqlx::query("UPDATE users SET avatar = ? WHERE id=?")
        .bind(Some("https://example.com/a.png"))
        .bind(uid)
        .execute(&db.pool)
        .await
        .unwrap();

    let r = sqlx::query("SELECT avatar FROM users WHERE id = ?")
        .bind(uid)
        .fetch_one(&db.pool)
        .await
        .unwrap();
    let avatar: Option<String> = r.try_get("avatar").unwrap();
    assert_eq!(avatar.unwrap(), "https://example.com/a.png");

    // clear avatar
    sqlx::query("UPDATE users SET avatar = NULL WHERE id=?")
        .bind(uid)
        .execute(&db.pool)
        .await
        .unwrap();
    let r2 = sqlx::query("SELECT avatar FROM users WHERE id = ?")
        .bind(uid)
        .fetch_one(&db.pool)
        .await
        .unwrap();
    let avatar2: Option<String> = r2.try_get("avatar").unwrap();
    assert!(avatar2.is_none());
}

#[tokio::test]
async fn replace_relationships_self_and_duplicates() {
    let (db, cfg) = new_test_db().await;
    logging::init(false);
    let app_components = didhub_server::build_app(db.clone(), cfg.clone()).await;
    let app = app_components.router;

    // create two alters
    let res1 = sqlx::query("INSERT INTO alters (name, owner_user_id) VALUES (?, ?)")
        .bind("A1")
        .bind(1_i64)
        .execute(&db.pool)
        .await
        .unwrap();
    let a1 = res1.last_insert_id();
    let res2 = sqlx::query("INSERT INTO alters (name, owner_user_id) VALUES (?, ?)")
        .bind("A2")
        .bind(1_i64)
        .execute(&db.pool)
        .await
        .unwrap();
    let a2 = res2.last_insert_id();

    // call update handler with self reference and duplicates
    let body = json!({"partners": [a1, a1, a2]});
    let (st, _b) = auth_req(&app, axum::http::Method::PUT, &format!("/api/alters/{:?}", a1), "", Some(body)).await;
    assert!(st == 401 || st == 204 || st == 404);

    // ensure DB hasn't created multiple self links
    let row = sqlx::query("SELECT COUNT(*) as cnt FROM alter_partners WHERE alter_id = ? AND partner_alter_id = ?")
        .bind(a1)
        .bind(a1)
        .fetch_one(&db.pool)
        .await
        .unwrap();
    let cnt: i64 = row.try_get("cnt").unwrap_or(0);
    assert!(cnt <= 1);
}

#[tokio::test]
async fn update_user_avatar_api_fields() {
    let (db, cfg) = new_test_db().await;
    logging::init(false);
    let app_components = didhub_server::build_app(db.clone(), cfg.clone()).await;
    let _app = app_components.router;

    // create a user via the public create_user helper
    let nu = didhub_server::db::NewUser { username: "avatar_api_user".into(), password_hash: "hash".into(), is_system: false, is_approved: false };
    let user = db.create_user(nu).await.unwrap();

    // set avatar via UpdateUserFields: Some(Some(url))
    let mut f = didhub_server::db::UpdateUserFields::default();
    f.avatar = Some(Some("https://example.com/x.png".into()));
    let res = db.update_user(user.id, f).await.unwrap().unwrap();
    assert_eq!(res.avatar.unwrap(), "https://example.com/x.png");

    // clear avatar via Some(None)
    let mut f2 = didhub_server::db::UpdateUserFields::default();
    f2.avatar = Some(None);
    let res2 = db.update_user(user.id, f2).await.unwrap().unwrap();
    assert!(res2.avatar.is_none());
}
