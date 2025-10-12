use didhub_server::{db::Db, config::AppConfig};
use axum::body::Body;
use axum::http::{Request, StatusCode};
use http_body_util::BodyExt;
use tower::ServiceExt; // for oneshot

async fn setup() -> (Db, AppConfig, axum::Router) {
    let db_file = format!("test-data/posts-{}.sqlite", uuid::Uuid::new_v4());
        let db_file = format!("test-db-posts-{}.sqlite", uuid::Uuid::new_v4());
        if std::path::Path::new(&db_file).exists() { let _ = std::fs::remove_file(&db_file); }
        if let Some(p) = std::path::Path::new(&db_file).parent() { std::fs::create_dir_all(p).ok(); }
        let _ = std::fs::OpenOptions::new().create(true).write(true).open(&db_file).expect("create sqlite file");
        sqlx::any::install_default_drivers();
    if std::path::Path::new(&db_file).exists() { let _ = std::fs::remove_file(&db_file); }
    if let Some(p) = std::path::Path::new(&db_file).parent() { std::fs::create_dir_all(p).ok(); }
    let _ = std::fs::OpenOptions::new().create(true).write(true).open(&db_file).expect("create sqlite file");
    sqlx::any::install_default_drivers();
    let db = Db::connect_with_file(&db_file).await.expect("connect sqlite");
    let cfg = AppConfig::default_for_tests();
    let app_components = didhub_server::build_app(db.clone(), cfg.clone()).await;
    let app = app_components.router;
    (db, cfg, app)
}

async fn get_csrf(app: &axum::Router) -> (String, String) {
    let health = Request::builder().method("GET").uri("/health").body(Body::empty()).unwrap();
    let resp = app.clone().oneshot(health).await.unwrap();
    let cookie = resp.headers().get("set-cookie").unwrap().to_str().unwrap().to_string();
    let token = cookie.split(';').next().unwrap().split('=').nth(1).unwrap().to_string();
    (cookie, token)
}

async fn register_and_login(db: &Db, app: &axum::Router, username: &str, password: &str, approve: bool) -> (String, String, String) {
    let (csrf_cookie, csrf_token) = get_csrf(app).await;
    let reg = Request::builder().method("POST").uri("/api/auth/register")
        .header("content-type", "application/json")
        .header("cookie", &csrf_cookie)
        .header("x-csrf-token", &csrf_token)
        .body(Body::from(format!("{{\"username\":\"{}\",\"password\":\"{}\"}}", username, password))).unwrap();
    let _ = app.clone().oneshot(reg).await.unwrap();
    if approve {
        // approve user so login will succeed
        sqlx::query("UPDATE users SET is_approved=1 WHERE username=?").bind(username).execute(&db.pool).await.unwrap();
    }
    // promote to admin directly in DB not available here; use login then manually update user row via db? Instead call login then update user as admin in DB.
    // Fetch user id
    // Simpler: after registration update user flags in DB directly
    // This test operates with direct DB access
    // login to get token after promotion
    let (csrf_cookie2, csrf_token2) = get_csrf(app).await; // new CSRF for login (rotation path allowed)
    let login_req = Request::builder().method("POST").uri("/api/auth/login")
        .header("content-type", "application/json")
        .header("cookie", &csrf_cookie2)
        .header("x-csrf-token", &csrf_token2)
        .body(Body::from(format!("{{\"username\":\"{}\",\"password\":\"{}\"}}", username, password))).unwrap();
    let resp = app.clone().oneshot(login_req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
    let body_bytes = resp.into_body().collect().await.unwrap().to_bytes();
    let v: serde_json::Value = serde_json::from_slice(&body_bytes).unwrap();
    (v.get("token").and_then(|t| t.as_str()).unwrap().to_string(), csrf_cookie2, csrf_token2)
}

#[tokio::test]
async fn test_create_and_repost() {
    let (db, _cfg, app) = setup().await;
    // register admin user
    let (token, _c, _t) = register_and_login(&db, &app, "admin1", "pass123", true).await;
    // escalate privileges
    sqlx::query("UPDATE users SET is_admin=1, is_approved=1 WHERE username='admin1'").execute(&db.pool).await.unwrap();

    // create post
    let (csrf_cookie3, csrf_token3) = get_csrf(&app).await;
    let create_req = Request::builder().method("POST").uri("/api/posts")
        .header("content-type", "application/json")
        .header("authorization", format!("Bearer {}", token))
        .header("cookie", &csrf_cookie3)
        .header("x-csrf-token", &csrf_token3)
        .body(Body::from("{\"body\":\"Hello world\"}"))
        .unwrap();
    let resp = app.clone().oneshot(create_req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
    let body_bytes = resp.into_body().collect().await.unwrap().to_bytes();
    let v: serde_json::Value = serde_json::from_slice(&body_bytes).unwrap();
    let post_id = v["item"]["id"].as_str().unwrap().to_string();

    // repost
    let (csrf_cookie4, csrf_token4) = get_csrf(&app).await;
    let repost_req = Request::builder().method("POST").uri(format!("/api/posts/{}/repost", post_id))
        .header("authorization", format!("Bearer {}", token))
        .header("cookie", &csrf_cookie4)
        .header("x-csrf-token", &csrf_token4)
        .body(Body::empty())
        .unwrap();
    let resp2 = app.clone().oneshot(repost_req).await.unwrap();
    assert_eq!(resp2.status(), StatusCode::OK);
    let body_bytes2 = resp2.into_body().collect().await.unwrap().to_bytes();
    let v2: serde_json::Value = serde_json::from_slice(&body_bytes2).unwrap();
    assert_eq!(v2["item"]["repost_of_post_id"].as_str(), Some(&post_id));

    // list posts
    let list_req = Request::builder().method("GET").uri("/api/posts?limit=10")
        .header("authorization", format!("Bearer {}", token))
        .body(Body::empty())
        .unwrap();
    let resp3 = app.clone().oneshot(list_req).await.unwrap();
    assert_eq!(resp3.status(), StatusCode::OK);
    let list_bytes = resp3.into_body().collect().await.unwrap().to_bytes();
    let vlist: serde_json::Value = serde_json::from_slice(&list_bytes).unwrap();
    let items = vlist["items"].as_array().unwrap();
    assert_eq!(items.len(), 2);
}
