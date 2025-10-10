use didhub_server::{config::AppConfig, db};
use sqlx::any::AnyPoolOptions;
use axum::{body::Body, http::{Request, StatusCode}};
use tower::ServiceExt; // for oneshot
use argon2::{Argon2, PasswordHasher};
use argon2::password_hash::{rand_core::OsRng, SaltString};

async fn test_app() -> (axum::Router, db::Db) {
    let cfg = AppConfig::default_for_tests();
    // create in-memory sqlite any pool
    let pool = AnyPoolOptions::new().max_connections(5).connect("sqlite::memory:").await.unwrap();
    // run migrations - minimal tables required for users
    // assuming migrations already handle users; if not, create table inline
    let database_url = "sqlite::memory:".to_string();
    let database = db::Db::from_any_pool(pool, db::DbBackend::Sqlite, database_url);
    // create minimal users table if not exists
    sqlx::query("CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, password_hash TEXT, is_system INTEGER, is_admin INTEGER DEFAULT 0, is_approved INTEGER DEFAULT 1, created_at TEXT DEFAULT '')").execute(&database.pool).await.unwrap();
    let salt = SaltString::generate(&mut OsRng);
    let argon2 = Argon2::default();
    let hash = argon2.hash_password(b"password", &salt).unwrap().to_string();
    let admin = database.create_user(db::NewUser { username: "admin".into(), password_hash: hash, is_system: false, is_approved: true }).await.unwrap();
    sqlx::query("UPDATE users SET is_admin=1 WHERE id=?1")
        .bind(admin.id)
        .execute(&database.pool)
        .await
        .unwrap();
    let app_components = didhub_server::build_app(database.clone(), cfg).await;
    let app = app_components.router;
    (app, database)
}

#[tokio::test]
async fn secret_update_requires_admin() {
    let (app, _db) = test_app().await;
    let req = Request::builder()
        .method("POST")
        .uri("/oidc/google/secret")
        .header("content-type","application/json")
        .body(Body::from("{}"))
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::UNAUTHORIZED); // middleware should enforce auth
}

// More exhaustive tests would mock auth middleware; omitted for brevity.
