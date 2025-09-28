use didhub_server::{build_router, config::AppConfig, db::Db, logging};
use axum::{body::{Body, self}, http::Request};
use tower::ServiceExt;
use serde_json::Value;
use axum::http::StatusCode;

async fn setup() -> (axum::Router, String, String) {
    logging::init(false);
    let db_file = format!("test-db-groups-{}.sqlite", uuid::Uuid::new_v4());
    let sqlite_url = format!("sqlite://{}", db_file.replace('\\',"/"));
    let pool = sqlx::any::AnyPoolOptions::new().max_connections(1).connect(&sqlite_url).await.expect("connect sqlite");
    let db = Db::from_any_pool(pool, didhub_server::db::DbBackend::Sqlite, sqlite_url.clone());
    let cfg = AppConfig::default_for_tests();
    let router = build_router(db.clone(), cfg.clone()).await;
    // register user
    let payload = serde_json::json!({"username":"guser","password":"pw","is_system":true});
    let res = router.clone().oneshot(Request::builder().method("POST").uri("/api/auth/register")
        .header("content-type","application/json")
        .body(Body::from(payload.to_string())).unwrap()).await.unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    let body = body::to_bytes(res.into_body(), 1024*1024).await.unwrap();
    let v: Value = serde_json::from_slice(&body).unwrap();
    let token = v.get("token").and_then(|t| t.as_str()).unwrap().to_string();
    // fetch CSRF cookie from health endpoint
    let health = router.clone().oneshot(Request::get("/health").body(Body::empty()).unwrap()).await.unwrap();
    let cookie = health.headers().get("set-cookie").map(|h| h.to_str().unwrap().to_string()).unwrap_or_default();
    (router, token, cookie)
}

#[tokio::test]
async fn group_lifecycle() {
    let (router, token, cookie) = setup().await;
    let csrf = cookie.split(';').next().unwrap_or("").split('=').nth(1).unwrap_or("").to_string();
    // create group
    let create = serde_json::json!({"name":"Group A","description":"desc","leaders":[1,2]});
    let res = router.clone().oneshot(Request::builder().method("POST").uri("/api/groups")
        .header("content-type","application/json")
        .header("authorization", format!("Bearer {}", token))
        .header("cookie", &cookie)
        .header("x-csrf-token", &csrf)
        .body(Body::from(create.to_string())).unwrap()).await.unwrap();
    assert_eq!(res.status(), StatusCode::CREATED);
    let body = body::to_bytes(res.into_body(), 1024*1024).await.unwrap();
    let v: Value = serde_json::from_slice(&body).unwrap();
    let gid = v.get("id").unwrap().as_i64().unwrap();
    assert_eq!(v.get("name").unwrap().as_str().unwrap(), "Group A");

    // list groups
    let res = router.clone().oneshot(Request::builder().method("GET").uri("/api/groups")
        .header("authorization", format!("Bearer {}", token))
        .body(Body::empty()).unwrap()).await.unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    let body = body::to_bytes(res.into_body(), 1024*1024).await.unwrap();
    let v: Value = serde_json::from_slice(&body).unwrap();
    assert!(v.get("items").unwrap().as_array().unwrap().len() >= 1);

    // get group
    let res = router.clone().oneshot(Request::builder().method("GET").uri(format!("/api/groups/{}", gid))
        .header("authorization", format!("Bearer {}", token))
        .body(Body::empty()).unwrap()).await.unwrap();
    assert_eq!(res.status(), StatusCode::OK);

    // update group
    let upd = serde_json::json!({"description":"updated"});
    let res = router.clone().oneshot(Request::builder().method("PUT").uri(format!("/api/groups/{}", gid))
        .header("content-type","application/json")
        .header("authorization", format!("Bearer {}", token))
        .header("cookie", &cookie)
        .header("x-csrf-token", &csrf)
        .body(Body::from(upd.to_string())).unwrap()).await.unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    let body = body::to_bytes(res.into_body(), 1024*1024).await.unwrap();
    let v: Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(v.get("description").unwrap().as_str().unwrap(), "updated");

    // toggle leader add new
    let toggle = serde_json::json!({"alter_id": 5, "add": true});
    let res = router.clone().oneshot(Request::builder().method("POST").uri(format!("/api/groups/{}/leaders/toggle", gid))
        .header("content-type","application/json")
        .header("authorization", format!("Bearer {}", token))
        .header("cookie", &cookie)
        .header("x-csrf-token", &csrf)
        .body(Body::from(toggle.to_string())).unwrap()).await.unwrap();
    assert_eq!(res.status(), StatusCode::OK);

    // delete group
    let res = router.clone().oneshot(Request::builder().method("DELETE").uri(format!("/api/groups/{}", gid))
        .header("authorization", format!("Bearer {}", token))
        .header("cookie", &cookie)
        .header("x-csrf-token", &csrf)
        .body(Body::empty()).unwrap()).await.unwrap();
    assert_eq!(res.status(), StatusCode::NO_CONTENT);

    // ensure gone
    let res = router.clone().oneshot(Request::builder().method("GET").uri(format!("/api/groups/{}", gid))
        .header("authorization", format!("Bearer {}", token))
        .body(Body::empty()).unwrap()).await.unwrap();
    assert_eq!(res.status(), StatusCode::NOT_FOUND);
}
