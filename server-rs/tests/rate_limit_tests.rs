use didhub_server::{db::Db, config::AppConfig};
use axum::http::Request;
use axum::body::Body;
use tower::ServiceExt;
use argon2::{Argon2, PasswordHasher};
use argon2::password_hash::{rand_core::OsRng, SaltString};

async fn setup() -> (Db, AppConfig, axum::Router) {
    let path = format!("test-data/rl-{}.sqlite", uuid::Uuid::new_v4());
    if std::path::Path::new(&path).exists() { let _ = std::fs::remove_file(&path); }
    if let Some(p) = std::path::Path::new(&path).parent() { std::fs::create_dir_all(p).ok(); }
    let _ = std::fs::OpenOptions::new().create(true).write(true).open(&path).expect("create sqlite file");
    sqlx::any::install_default_drivers();
    let db = Db::connect_with_file(&path).await.unwrap();
    let cfg = AppConfig::default_for_tests();
    let app_components = didhub_server::build_app(db.clone(), cfg.clone()).await;
    let app = app_components.router;
    (db, cfg, app)
}

#[tokio::test]
async fn login_rate_limit() {
    let (db, _cfg, app) = setup().await;
    // create a user directly
    let salt = SaltString::generate(&mut OsRng);
    let argon2 = Argon2::default();
    let pass_hash = argon2.hash_password(b"pw", &salt).unwrap().to_string();
    sqlx::query("INSERT INTO users (username, password_hash, is_system, is_admin, is_approved, must_change_password) VALUES ('u1', ?, 0,0,1,0)")
        .bind(pass_hash)
        .execute(&db.pool).await.unwrap();

    for i in 0..6 { // limit is 5 in 60s window
        let req = Request::builder().method("POST").uri("/api/auth/login")
            .header("content-type", "application/json")
            .body(Body::from("{\"username\":\"u1\",\"password\":\"pw\"}"))
            .unwrap();
        let resp = app.clone().oneshot(req).await.unwrap();
        if i < 5 { assert!(resp.status().is_success(), "attempt {} should succeed", i); } else { assert_eq!(resp.status(), axum::http::StatusCode::TOO_MANY_REQUESTS); }
    }
}
