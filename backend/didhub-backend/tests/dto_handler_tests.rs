use std::sync::Arc;

use didhub_auth::TestAuthenticator;
use didhub_backend::handlers::users::create;
use didhub_backend::state::AppState;
use didhub_db::{create_pool, DbConnectionConfig};
use didhub_log_client::LogToolClient;
// We'll inspect the HTTP response produced by ApiError via IntoResponse

#[tokio::test]
async fn create_user_returns_structured_validation() {
    let config = DbConnectionConfig::new("sqlite::memory:");
    let pool = create_pool(&config).await.expect("create pool");

    // create users table using full migrations schema
    sqlx::query(
        r#"CREATE TABLE users (
            id TEXT PRIMARY KEY,
            username TEXT NOT NULL,
            about_me TEXT,
            password_hash TEXT NOT NULL,
            avatar TEXT,
            must_change_password INTEGER NOT NULL,
            last_login_at TEXT,
            display_name TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            roles TEXT NOT NULL,
            settings TEXT NOT NULL
        )"#,
    )
    .execute(&pool)
    .await
    .expect("create table");

    let log_dir = std::env::temp_dir().join("didhub_test_logs");
    std::fs::create_dir_all(&log_dir).expect("create log dir");
    let log = LogToolClient::new(log_dir.to_str().unwrap());
    let test_auth =
        std::sync::Arc::from(Box::new(TestAuthenticator::new_with_scopes(
            vec!["admin".to_string()],
        )) as Box<dyn didhub_auth::AuthenticatorTrait>);
    let state = AppState::new(
        pool.clone(),
        log,
        test_auth,
        didhub_job_queue::JobQueueClient::new(),
        didhub_updates::UpdateCoordinator::new(),
    );
    let arc_state = Arc::new(state);

    // create user with empty username and short password so deserialization succeeds
    // and dto.validate() can return multiple validation issues
    let body = serde_json::json!({ "username": "", "passwordHash": "short" });
    let res = create::create(
        axum::Extension(arc_state.clone()),
        axum::http::HeaderMap::new(),
        Some(axum::Json(body)),
    )
    .await;
    match res {
        Ok(json_resp) => {
            // For validation errors, the handler returns Ok with validation payload
            let v = json_resp.0;
            assert!(
                v.get("validation").is_some(),
                "expected validation key in response JSON"
            );
        }
        Err(_) => panic!("expected Ok with validation payload"),
    }
}
