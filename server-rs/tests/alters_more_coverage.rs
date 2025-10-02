use didhub_server::{build_router, config::AppConfig, db::{Db, UpdateUserFields}};
use axum::{body::{Body, self}, http::{Request, StatusCode}};
use tower::util::ServiceExt; // oneshot
use serde_json::json;

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
async fn alters_admin_can_get_owner_alter() {
    let db_path = format!("test-{}.db", uuid::Uuid::new_v4());
    if std::path::Path::new(&db_path).exists() { let _ = std::fs::remove_file(&db_path); }
    if let Some(p) = std::path::Path::new(&db_path).parent() { std::fs::create_dir_all(p).ok(); }
    let _ = std::fs::OpenOptions::new().create(true).write(true).open(&db_path).expect("create sqlite file");
    sqlx::any::install_default_drivers();
    let db = Db::connect_with_file(&db_path).await.expect("connect sqlite");
    let cfg = test_cfg();
    let app = build_router(db.clone(), cfg).await;

    // Create two users
    let token_owner = register_and_login(&db, &app, "admin_vis_owner", "pw", true).await;
    let token_admin = register_and_login(&db, &app, "admin_vis_admin", "pw", true).await;

    // Promote admin user to admin
    let adm = db.fetch_user_by_username("admin_vis_admin").await.unwrap().unwrap();
    let mut f = UpdateUserFields::default(); f.is_admin = Some(true); f.is_approved = Some(true); db.update_user(adm.id, f).await.unwrap();

    // owner creates an alter
    let (st, body) = auth_req(&app, axum::http::Method::POST, "/api/alters", &token_owner, Some(json!({"name":"OwnerAlpha"}))).await;
    assert_eq!(st, StatusCode::OK);
    let id = body["id"].as_i64().unwrap();

    // admin should be able to GET it
    let (stg, got) = auth_req(&app, axum::http::Method::GET, &format!("/api/alters/{}", id), &token_admin, None).await;
    assert_eq!(stg, StatusCode::OK);
    assert_eq!(got["id"].as_i64().unwrap(), id);
}

#[tokio::test]
async fn alters_update_relationships_changes_db() {
    let db_path = format!("test-{}.db", uuid::Uuid::new_v4());
    if std::path::Path::new(&db_path).exists() { let _ = std::fs::remove_file(&db_path); }
    if let Some(p) = std::path::Path::new(&db_path).parent() { std::fs::create_dir_all(p).ok(); }
    let _ = std::fs::OpenOptions::new().create(true).write(true).open(&db_path).expect("create sqlite file");
    sqlx::any::install_default_drivers();
    let db = Db::connect_with_file(&db_path).await.expect("connect sqlite");
    let cfg = test_cfg();
    let app = build_router(db.clone(), cfg).await;

    // Create two users
    let token_owner = register_and_login(&db, &app, "rel_owner", "pw", true).await;
    let _token_other = register_and_login(&db, &app, "rel_other", "pw", true).await;

    // owner creates an alter
    let (st, body) = auth_req(&app, axum::http::Method::POST, "/api/alters", &token_owner, Some(json!({"name":"RelAlpha"}))).await;
    assert_eq!(st, StatusCode::OK);
    let id = body["id"].as_i64().unwrap();

    // create two more alters to reference
    let (st2, b2) = auth_req(&app, axum::http::Method::POST, "/api/alters", &token_owner, Some(json!({"name":"RelBeta"}))).await; assert_eq!(st2, StatusCode::OK);
    let beta = b2["id"].as_i64().unwrap();
    let (st3, b3) = auth_req(&app, axum::http::Method::POST, "/api/alters", &token_owner, Some(json!({"name":"RelGamma"}))).await; assert_eq!(st3, StatusCode::OK);
    let gamma = b3["id"].as_i64().unwrap();

    // Update relationships on RelAlpha: set partners=[beta,gamma], parents=[beta], children=[gamma], affiliations=[beta]
    let body_up = json!({"partners":[beta,gamma], "parents":[beta], "children":[gamma], "affiliations":[beta]});
    let (st_up, _up_body) = auth_req(&app, axum::http::Method::PUT, &format!("/api/alters/{}", id), &token_owner, Some(body_up)).await;
    assert_eq!(st_up, StatusCode::OK);

    // Verify via DB helpers directly
    let parts = db.partners_of(id).await.unwrap();
    assert!(parts.contains(&beta) && parts.contains(&gamma));
    let parents = db.parents_of(id).await.unwrap();
    assert_eq!(parents, vec![beta]);
    let children = db.children_of(id).await.unwrap();
    assert_eq!(children, vec![gamma]);
    let affs = db.affiliations_of(id).await.unwrap();
    assert_eq!(affs, vec![beta]);
}

#[tokio::test]
async fn alters_admin_delete_other_users_alter() {
    let db_path = format!("test-{}.db", uuid::Uuid::new_v4());
    if std::path::Path::new(&db_path).exists() { let _ = std::fs::remove_file(&db_path); }
    if let Some(p) = std::path::Path::new(&db_path).parent() { std::fs::create_dir_all(p).ok(); }
    let _ = std::fs::OpenOptions::new().create(true).write(true).open(&db_path).expect("create sqlite file");
    sqlx::any::install_default_drivers();
    let db = Db::connect_with_file(&db_path).await.expect("connect sqlite");
    let cfg = test_cfg();
    let app = build_router(db.clone(), cfg).await;

    // Create owner and admin
    let token_owner = register_and_login(&db, &app, "adm_owner", "pw", true).await;
    let token_admin = register_and_login(&db, &app, "adm_user", "pw", true).await;

    // Promote admin
    let au = db.fetch_user_by_username("adm_user").await.unwrap().unwrap();
    let mut ff = UpdateUserFields::default(); ff.is_admin = Some(true); ff.is_approved = Some(true); db.update_user(au.id, ff).await.unwrap();

    // owner creates an alter
    let (st, body) = auth_req(&app, axum::http::Method::POST, "/api/alters", &token_owner, Some(json!({"name":"ToBeDeleted"}))).await;
    assert_eq!(st, StatusCode::OK);
    let id = body["id"].as_i64().unwrap();

    // admin deletes it
    let (sd, _) = auth_req(&app, axum::http::Method::DELETE, &format!("/api/alters/{}", id), &token_admin, None).await;
    assert_eq!(sd, StatusCode::NO_CONTENT);

    // ensure it's gone
    let (sget, _) = auth_req(&app, axum::http::Method::GET, &format!("/api/alters/{}", id), &token_admin, None).await;
    assert_eq!(sget, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn alters_names_search_projection_and_delete() {
    let db_path = format!("test-{}.db", uuid::Uuid::new_v4());
    if std::path::Path::new(&db_path).exists() { let _ = std::fs::remove_file(&db_path); }
    if let Some(p) = std::path::Path::new(&db_path).parent() { std::fs::create_dir_all(p).ok(); }
    let _ = std::fs::OpenOptions::new().create(true).write(true).open(&db_path).expect("create sqlite file");
    sqlx::any::install_default_drivers();
    let db = Db::connect_with_file(&db_path).await.expect("connect sqlite");
    let cfg = test_cfg();
    let app = build_router(db.clone(), cfg).await;

    // Create two users
    let token_u1 = register_and_login(&db, &app, "cov_user1", "pw", true).await;
    let token_u2 = register_and_login(&db, &app, "cov_user2", "pw", true).await;

    // Promote user2 to admin directly via DB helper
    let user2 = db.fetch_user_by_username("cov_user2").await.unwrap().unwrap();
    let mut fields = UpdateUserFields::default();
    fields.is_admin = Some(true);
    fields.is_approved = Some(true);
    db.update_user(user2.id, fields).await.unwrap();

    // user1 creates Alpha
    let (st, body) = auth_req(&app, axum::http::Method::POST, "/api/alters", &token_u1, Some(json!({"name":"Alpha"}))).await;
    assert_eq!(st, StatusCode::OK);
    let alpha_id = body["id"].as_i64().unwrap();

    // admin (user2) creates Beta explicitly for user1
    let (st2, _body2) = auth_req(&app, axum::http::Method::POST, "/api/alters", &token_u2, Some(json!({"name":"Beta","owner_user_id": user2.id}))).await;
    assert_eq!(st2, StatusCode::OK);

    // list names
    let (st_names, names_body) = auth_req(&app, axum::http::Method::GET, "/api/alters/names", &token_u1, None).await;
    assert_eq!(st_names, StatusCode::OK);
    assert!(names_body
        .as_array()
        .unwrap()
        .iter()
        .any(|i| i["name"] == json!("Alpha")));

    // search
    let (st_search, search_body) = auth_req(&app, axum::http::Method::GET, "/api/alters/search?q=Alpha", &token_u1, None).await;
    assert_eq!(st_search, StatusCode::OK);
    assert_eq!(search_body["items"].as_array().unwrap()[0]["name"], json!("Alpha"));

    // projection: request relationships field toggle
    let (st_proj, proj_body) = auth_req(&app, axum::http::Method::GET, "/api/alters?fields=relationships", &token_u1, None).await;
    assert_eq!(st_proj, StatusCode::OK);
    assert!(proj_body["items"].is_array());

    // deletion: non-owner (but non-admin) cannot delete Alpha
    // register a fresh non-admin user
    let token_u3 = register_and_login(&db, &app, "cov_user3", "pw", true).await;
    let (st_forbid, _) = auth_req(&app, axum::http::Method::DELETE, &format!("/api/alters/{}", alpha_id), &token_u3, None).await;
    assert_eq!(st_forbid, StatusCode::FORBIDDEN);

    // owner can delete
    let (st_del, _) = auth_req(&app, axum::http::Method::DELETE, &format!("/api/alters/{}", alpha_id), &token_u1, None).await;
    assert_eq!(st_del, StatusCode::NO_CONTENT);
}

#[tokio::test]
async fn alters_get_visibility_and_projection_false_branch() {
    let db_path = format!("test-{}.db", uuid::Uuid::new_v4());
    if std::path::Path::new(&db_path).exists() { let _ = std::fs::remove_file(&db_path); }
    if let Some(p) = std::path::Path::new(&db_path).parent() { std::fs::create_dir_all(p).ok(); }
    let _ = std::fs::OpenOptions::new().create(true).write(true).open(&db_path).expect("create sqlite file");
    sqlx::any::install_default_drivers();
    let db = Db::connect_with_file(&db_path).await.expect("connect sqlite");
    let cfg = test_cfg();
    let app = build_router(db.clone(), cfg).await;

    // Create users
    let token_a = register_and_login(&db, &app, "vis_user_a", "pw", true).await; // will be approved
    let token_b = register_and_login(&db, &app, "vis_user_b", "pw", true).await; // will be owner
    let token_c = register_and_login(&db, &app, "vis_user_c", "pw", false).await; // will stay unapproved

    // Approve user A and B
    let ua = db.fetch_user_by_username("vis_user_a").await.unwrap().unwrap();
    let ub = db.fetch_user_by_username("vis_user_b").await.unwrap().unwrap();
    let mut f = UpdateUserFields::default(); f.is_approved = Some(true); db.update_user(ua.id, f).await.unwrap();
    let mut f2 = UpdateUserFields::default(); f2.is_approved = Some(true); db.update_user(ub.id, f2).await.unwrap();

    // user B creates an alter (owned by B)
    let (st_b, body_b) = auth_req(&app, axum::http::Method::POST, "/api/alters", &token_b, Some(json!({"name":"OwnerOnly"}))).await; assert_eq!(st_b, StatusCode::OK);
    let owner_alter_id = body_b["id"].as_i64().unwrap();

    // user A (approved) tries to GET B's alter -> should be Forbidden (true, Some(owner!=user.id))
    let (st_a_get, _) = auth_req(&app, axum::http::Method::GET, &format!("/api/alters/{}", owner_alter_id), &token_a, None).await;
    assert_eq!(st_a_get, StatusCode::FORBIDDEN);

    // Create an unowned alter directly via DB
    let unowned = db.create_alter(&serde_json::json!({"name":"Unowned"})).await.unwrap();

    // user A (approved) can GET unowned
    let (st_a_unowned, body_unowned) = auth_req(&app, axum::http::Method::GET, &format!("/api/alters/{}", unowned.id), &token_a, None).await; assert_eq!(st_a_unowned, StatusCode::OK);
    assert_eq!(body_unowned["id"].as_i64().unwrap(), unowned.id);

    // user C (unapproved) cannot GET unowned
    let (st_c_unowned, _) = auth_req(&app, axum::http::Method::GET, &format!("/api/alters/{}", unowned.id), &token_c, None).await; assert_eq!(st_c_unowned, StatusCode::FORBIDDEN);

    // Projection false-branch: request fields without relationships to set include_rels=false
    // Ensure there is at least one alter for listing
    let (st_list, list_body) = auth_req(&app, axum::http::Method::GET, "/api/alters?fields=id,name", &token_a, None).await; assert_eq!(st_list, StatusCode::OK);
    let items = list_body["items"].as_array().unwrap();
    // when include_rels=false, partners/parents/children/affiliations must be empty arrays
    if let Some(first) = items.get(0) {
        assert!(first.get("partners").is_some());
        assert_eq!(first["partners"].as_array().unwrap().len(), 0);
    }
}
