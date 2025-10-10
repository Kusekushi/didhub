use didhub_server as server;
use axum::{Router, body::Body};
use axum::http::{Request, StatusCode, header};
use tower::util::ServiceExt;

async fn test_app() -> Router {
    let db_file = format!("test-data/csrf-rot-{}.sqlite", uuid::Uuid::new_v4());
    let sqlite_url = format!("sqlite://{}", db_file.replace('\\', "/"));
    let pool = sqlx::any::AnyPoolOptions::new().max_connections(1).connect(&sqlite_url).await.expect("connect sqlite");
    let db = server::db::Db::from_any_pool(pool, server::db::DbBackend::DbBackend::Sqlite, sqlite_url.clone());
    let cfg = server::config::AppConfig::default_for_tests();
    let app_components = server::build_app(db, cfg).await;
    app_components.router
}

#[tokio::test]
async fn csrf_token_rotates_on_login() {
    let app = test_app().await;
    // register -> get token + rotate header will be set but cookie rotation happens on subsequent safe request
    let body = serde_json::json!({"username":"rotuser","password":"pw"}).to_string();
    let req = Request::builder().method("POST").uri("/api/auth/register").header(header::CONTENT_TYPE, "application/json").body(Body::from(body)).unwrap();
    let res = app.clone().oneshot(req).await.unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    // First GET to obtain initial CSRF cookie
    let res = app.clone().oneshot(Request::builder().uri("/health").body(Body::empty()).unwrap()).await.unwrap();
    let first = res.headers().get(header::SET_COOKIE).unwrap().to_str().unwrap().to_string();
    // Now login again to trigger rotate header
    let body = serde_json::json!({"username":"rotuser","password":"pw"}).to_string();
    let req = Request::builder().method("POST").uri("/api/auth/login").header(header::CONTENT_TYPE, "application/json").body(Body::from(body)).unwrap();
    let res = app.clone().oneshot(req).await.unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    // Next safe GET should receive rotated cookie
    let res = app.clone().oneshot(Request::builder().uri("/health").body(Body::empty()).unwrap()).await.unwrap();
    let second = res.headers().get(header::SET_COOKIE).unwrap().to_str().unwrap().to_string();
    assert_ne!(first, second, "CSRF cookie should rotate after login");
}
