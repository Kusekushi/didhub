use didhub_server::{config::AppConfig, db::Db};
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
    if resp.status() != StatusCode::OK {
        let status = resp.status();
        let body_bytes = body::to_bytes(resp.into_body(), 64 * 1024).await.unwrap();
        let s = String::from_utf8_lossy(&body_bytes);
        panic!("register failed: status={} body={}{}", status, s, if s.len() < 1000 { "" } else { " (truncated)" });
    }
    // Optionally approve the newly-registered user so tests can login immediately
    if approve {
        sqlx::query("UPDATE users SET is_approved = 1 WHERE username = ?").bind(username).execute(&db.pool).await.expect("approve user");
        // Verify approval applied
        let row: (i64,) = sqlx::query_as("SELECT is_approved FROM users WHERE username = ?").bind(username).fetch_one(&db.pool).await.expect("select is_approved");
        if row.0 == 0 {
            panic!("approval update did not take effect for user {}", username);
        }
    }

    if approve {
        // login (may rotate CSRF) - fetch fresh CSRF
        let health2 = app.clone().oneshot(Request::get("/health").body(Body::empty()).unwrap()).await.unwrap();
        let cookie2 = health2.headers().get("set-cookie").map(|h| h.to_str().unwrap().to_string()).unwrap_or_default();
        let csrf_token2 = cookie2.split(';').next().unwrap_or("").split('=').nth(1).unwrap_or("").to_string();
        let resp2 = app.clone().oneshot(Request::post("/api/auth/login").header("content-type","application/json").header("cookie", &cookie2).header("x-csrf-token", &csrf_token2).body(Body::from(body.to_string())).unwrap()).await.unwrap();
        if resp2.status() != StatusCode::OK {
            let status2 = resp2.status();
            let body_bytes = body::to_bytes(resp2.into_body(), 64 * 1024).await.unwrap();
            let s = String::from_utf8_lossy(&body_bytes);
            panic!("login failed: status={} body={}{}", status2, s, if s.len() < 1000 { "" } else { " (truncated)" });
        }
        let body_bytes = body::to_bytes(resp2.into_body(), 64 * 1024).await.unwrap();
        let v: serde_json::Value = serde_json::from_slice(&body_bytes).unwrap();
        v["token"].as_str().unwrap().to_string()
    } else {
        // For tests that need a token for an unapproved user, generate a JWT directly using test secret.
        let cfg = test_cfg();
        let header = jsonwebtoken::Header::new(jsonwebtoken::Algorithm::HS256);
        let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs();
        let exp = now + 60 * 60; // 1 hour
        let claims = serde_json::json!({ "sub": username, "exp": exp });
        let token = jsonwebtoken::encode(&header, &claims, &jsonwebtoken::EncodingKey::from_secret(cfg.jwt_secret.as_bytes())).unwrap();
        token
    }
}

async fn register_only(app: &axum::Router, username: &str, password: &str) {
    let health = app.clone().oneshot(Request::get("/health").body(Body::empty()).unwrap()).await.unwrap();
    let cookie = health.headers().get("set-cookie").map(|h| h.to_str().unwrap().to_string()).unwrap_or_default();
    let csrf_token = cookie.split(';').next().unwrap_or("").split('=').nth(1).unwrap_or("").to_string();
    let body = json!({"username": username, "password": password});
    let resp = app.clone().oneshot(Request::post("/api/auth/register").header("content-type","application/json").header("cookie", &cookie).header("x-csrf-token", &csrf_token).body(Body::from(body.to_string())).unwrap()).await.unwrap();
    if resp.status() != StatusCode::OK {
        let status = resp.status();
        let body_bytes = body::to_bytes(resp.into_body(), 64 * 1024).await.unwrap();
        let s = String::from_utf8_lossy(&body_bytes);
        panic!("register failed: status={} body={}{}", status, s, if s.len() < 1000 { "" } else { " (truncated)" });
    }
}

async fn login_only(app: &axum::Router, username: &str, password: &str) -> String {
    // fetch CSRF cookie/token
    let health = app.clone().oneshot(Request::get("/health").body(Body::empty()).unwrap()).await.unwrap();
    let cookie = health.headers().get("set-cookie").map(|h| h.to_str().unwrap().to_string()).unwrap_or_default();
    let csrf_token = cookie.split(';').next().unwrap_or("").split('=').nth(1).unwrap_or("").to_string();
    let body = json!({"username": username, "password": password});
    let resp = app.clone().oneshot(Request::post("/api/auth/login").header("content-type","application/json").header("cookie", &cookie).header("x-csrf-token", &csrf_token).body(Body::from(body.to_string())).unwrap()).await.unwrap();
    if resp.status() != StatusCode::OK {
        let status = resp.status();
        let body_bytes = body::to_bytes(resp.into_body(), 64 * 1024).await.unwrap();
        let s = String::from_utf8_lossy(&body_bytes);
        panic!("login failed: status={} body={}{}", status, s, if s.len() < 1000 { "" } else { " (truncated)" });
    }
    let body_bytes = body::to_bytes(resp.into_body(), 64 * 1024).await.unwrap();
    let v: serde_json::Value = serde_json::from_slice(&body_bytes).unwrap();
    v["token"].as_str().unwrap().to_string()
}

// Helper to approve a user by username using the internal Db available in the test scope.
async fn approve_user_by_username(db: &didhub_server::db::Db, username: &str) {
    let q = "UPDATE users SET is_approved = 1 WHERE username = ?";
    let res = sqlx::query(q).bind(username).execute(&db.pool).await;
    match res {
        Ok(_) => tracing::debug!(target = "didhub_server", username = username, "approved user"),
        Err(e) => panic!("approve_user_by_username failed: {:?}", e),
    }
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
async fn alters_visibility_matrix() {
    // fresh temp sqlite DB (avoid sqlx::any driver requirement)
    let db_file = format!("test-db-{}.sqlite", uuid::Uuid::new_v4());
    let sqlite_url = format!("sqlite://{}", db_file.replace('\\', "/"));
    if std::path::Path::new(&db_file).exists() { let _ = std::fs::remove_file(&db_file); }
    if let Some(p) = std::path::Path::new(&db_file).parent() { std::fs::create_dir_all(p).ok(); }
    let _ = std::fs::OpenOptions::new().create(true).write(true).open(&db_file).expect("create sqlite file");
    sqlx::any::install_default_drivers();
    let pool = sqlx::any::AnyPoolOptions::new().max_connections(1).connect(&sqlite_url).await.expect("connect sqlite");
    // Ensure migrations are applied for the test DB so tables exist
    sqlite_migrator().run(&pool).await.expect("run migrations");
    let db = Db::from_any_pool(pool, didhub_server::db::DbBackend::Sqlite, sqlite_url.clone());
    let cfg = test_cfg();
    let app_components = didhub_server::build_app(db.clone(), cfg).await;
    let app = app_components.router;

    // Diagnostic: attempt to create a user directly to surface DB errors quickly
    match db.create_user(didhub_server::db::NewUser { username: "diaguser".into(), password_hash: "x".into(), is_system: false, is_approved: false }).await {
        Ok(u) => tracing::debug!(target="didhub_server", user=%u.username, id=%u.id, "diag create_user ok"),
        Err(e) => panic!("direct db.create_user failed: {:?}", e),
    }

    // Register two users (both unapproved initially). Approve them in the test DB so they can log in.
    register_only(&app, "user1", "pw").await;
    register_only(&app, "user2", "pw").await;
    // approve both users directly in the test DB
    approve_user_by_username(&db, "user1").await;
    approve_user_by_username(&db, "user2").await;
    // obtain fresh tokens after approval
    let token_u1 = login_only(&app, "user1", "pw").await;
    let token_u2 = login_only(&app, "user2", "pw").await;

    // user1 creates an alter
    let (st, body) = auth_req(&app, axum::http::Method::POST, "/api/alters", &token_u1, Some(json!({"name":"Alpha"}))).await;
    assert_eq!(st, StatusCode::OK);
    let alter_id = body["id"].as_str().unwrap().to_string();

    // Add relationships (none exist yet) by updating with empty arrays first then another alter to relate to
    let (st2, body2) = auth_req(&app, axum::http::Method::POST, "/api/alters", &token_u1, Some(json!({"name":"Beta"}))).await; assert_eq!(st2, StatusCode::OK); let beta_id = body2["id"].as_str().unwrap().to_string();
    // Set partners and parents
    let (st_up_rel, _) = auth_req(&app, axum::http::Method::PUT, &format!("/api/alters/{}", alter_id), &token_u1, Some(json!({"partners":[beta_id], "children":[], "parents":[], "affiliations":[]}))).await; assert_eq!(st_up_rel, StatusCode::OK);
    let (st_get_alpha, alpha_full) = auth_req(&app, axum::http::Method::GET, &format!("/api/alters/{}", alter_id), &token_u1, None).await; assert_eq!(st_get_alpha, StatusCode::OK); assert_eq!(alpha_full["partners"].as_array().unwrap().contains(&json!(beta_id)), true);

    // user2 list should see only own (none)
    let (st_list, body_list) = auth_req(&app, axum::http::Method::GET, "/api/alters", &token_u2, None).await;
    assert_eq!(st_list, StatusCode::OK);
    assert_eq!(body_list["total"].as_i64().unwrap(), 0);

    // user2 cannot fetch user1's alter
    let (st_get, _) = auth_req(&app, axum::http::Method::GET, &format!("/api/alters/{}", alter_id), &token_u2, None).await;
    assert_eq!(st_get, StatusCode::FORBIDDEN);

    // Negative: user2 cannot modify user1's alter relationships
    let (st_mod_forbidden, _) = auth_req(&app, axum::http::Method::PUT, &format!("/api/alters/{}", alter_id), &token_u2, Some(json!({"partners":[]}))).await;
    assert_eq!(st_mod_forbidden, StatusCode::FORBIDDEN);

    // Add parent/child relationships (create Gamma as child of Alpha via update on Gamma)
    let (st_gamma, body_gamma) = auth_req(&app, axum::http::Method::POST, "/api/alters", &token_u1, Some(json!({"name":"Gamma"}))).await; assert_eq!(st_gamma, StatusCode::OK); let gamma_id = body_gamma["id"].as_str().unwrap().to_string();
    // Set parents of Gamma to Alpha
    let (st_set_parent, _) = auth_req(&app, axum::http::Method::PUT, &format!("/api/alters/{}", gamma_id), &token_u1, Some(json!({"parents":[alter_id]}))).await; assert_eq!(st_set_parent, StatusCode::OK);
    // Verify parent/child linkage
    let (st_get_gamma, gamma_full) = auth_req(&app, axum::http::Method::GET, &format!("/api/alters/{}", gamma_id), &token_u1, None).await; assert_eq!(st_get_gamma, StatusCode::OK); assert!(gamma_full["parents"].as_array().unwrap().contains(&json!(alter_id)));
    let (st_get_alpha2, alpha_again) = auth_req(&app, axum::http::Method::GET, &format!("/api/alters/{}", alter_id), &token_u1, None).await; assert_eq!(st_get_alpha2, StatusCode::OK); assert!(alpha_again["children"].as_array().unwrap().contains(&json!(gamma_id)));

    // Affiliations: create a pseudo affiliation id by just referencing numeric IDs (no separate table yet beyond join) -> use 42 & 43
    let (st_aff, _) = auth_req(&app, axum::http::Method::PUT, &format!("/api/alters/{}", alter_id), &token_u1, Some(json!({"affiliations":[42,43]}))).await; assert_eq!(st_aff, StatusCode::OK);
    let (st_alpha_aff, alpha_with_aff) = auth_req(&app, axum::http::Method::GET, &format!("/api/alters/{}", alter_id), &token_u1, None).await; assert_eq!(st_alpha_aff, StatusCode::OK); let affs = alpha_with_aff["affiliations"].as_array().unwrap(); assert!(affs.contains(&json!(42)) && affs.contains(&json!(43)));

    // Negative: Non-owner cannot change ownership via update with owner_user_id
    let (st_owner_change, _) = auth_req(&app, axum::http::Method::PUT, &format!("/api/alters/{}", alter_id), &token_u2, Some(json!({"owner_user_id":999}))).await; assert_eq!(st_owner_change, StatusCode::FORBIDDEN);
}
