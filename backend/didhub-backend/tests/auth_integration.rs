use didhub_auth::TestAuthenticator;
use didhub_backend::handlers::auth;
use didhub_backend::state::AppState;
use didhub_db::create_pool;
use didhub_db::DbConnectionConfig;
use didhub_job_queue::JobQueueClient;
use didhub_updates::UpdateCoordinator;
#[allow(unused_imports)]
use sqlx::Executor;
use std::sync::Arc;

#[tokio::test]
async fn login_me_logout_flow() {
    // Create an in-memory sqlite DB and ensure users table
    let cfg = DbConnectionConfig::new("sqlite::memory:");
    let pool = create_pool(&cfg).await.expect("create pool");
    // Create users table similar to migrations (minimal)
    // Use BLOB for id so it stores UUID as 16-byte native value when uuid-native feature is active
    sqlx::query(r#"CREATE TABLE users (id BLOB PRIMARY KEY, username TEXT, password_hash TEXT, created_at TEXT, updated_at TEXT, roles TEXT, settings TEXT, about_me TEXT, avatar TEXT, must_change_password INTEGER, last_login_at TEXT, display_name TEXT)"#)
        .execute(&pool)
        .await
        .expect("create table");

    // Insert a user with argon2 password hash
    let password = "secret123";
    let password_hash = didhub_auth::auth::hash_client_password(&didhub_auth::auth::sha256_hex(password)).expect("hash");
    let id = uuid::Uuid::new_v4();
    let now = chrono::Utc::now().to_rfc3339();
    sqlx::query("INSERT INTO users (id, username, password_hash, created_at, updated_at, roles, settings) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .bind(id)
        .bind("testuser")
        .bind(&password_hash)
        .bind(&now)
        .bind(&now)
        .bind("[\"user\"]")
        .bind("{}")
        .execute(&pool)
        .await
        .expect("insert user");

    // Build a minimal AppState with TestAuthenticator (won't be used for login)
    let parsed_id = id;
    let auth = std::sync::Arc::new(TestAuthenticator::new_with(
        vec!["user".to_string()],
        Some(parsed_id),
    )) as Arc<dyn didhub_auth::auth::AuthenticatorTrait>;
    let state = AppState::new(
        pool.clone(),
        auth,
        JobQueueClient::new(),
        UpdateCoordinator::new(),
        None,
    );
    let ext = axum::extract::Extension(Arc::new(state));

    // Ensure jwt secret is present so login can sign tokens
    std::env::set_var("DIDHUB_JWT_SECRET", "test-secret");

    // Call login handler with correct credentials
    let body = Some(axum::Json(
        serde_json::json!({"username":"testuser","password": didhub_auth::auth::sha256_hex(password)}),
    ));
    let resp = auth::login::login(ext.clone(), body).await.expect("login");
    // Expect 200 and Set-Cookie header present
    let headers = resp.headers();
    assert!(headers.get(&axum::http::header::SET_COOKIE).is_some());

    // Extract cookie value (very minimal parsing)
    let cookie = headers
        .get(&axum::http::header::SET_COOKIE)
        .unwrap()
        .to_str()
        .unwrap()
        .to_string();
    assert!(cookie.contains("didhub_session"));
}
