use std::collections::HashMap;
use std::sync::Arc;

use didhub_db::{create_pool, DbConnectionConfig};
use didhub_log_client::LogToolClient;

use didhub_auth::TestAuthenticator;
use didhub_backend::handlers::users;
use didhub_backend::handlers::users::dto::CreateUserDto;
use didhub_backend::state::AppState;

#[tokio::test]
async fn users_crud_sqlite_in_memory() {
    // Create an in-memory sqlite pool
    let config = DbConnectionConfig::new("sqlite::memory:");
    let pool = create_pool(&config).await.expect("create pool");

    // Create the users table using full migrations schema
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

    // Build AppState
    let log = LogToolClient::new("/tmp/nonexistent");
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

    // Build headers with a dummy Authorization token so TestAuthenticator is invoked
    let mut headers = axum::http::HeaderMap::new();
    headers.insert(
        axum::http::header::AUTHORIZATION,
        axum::http::HeaderValue::from_static("Bearer test-token"),
    );

    // Create user via handler
    let dto = CreateUserDto {
        username: "inttest".into(),
        password_hash: "longpassword".into(),
        display_name: Some("inttest".to_string()),
        about_me: None,
        roles: None,
    };
    let body = serde_json::to_value(&dto).unwrap();
    let res = users::create_user(
        axum::Extension(arc_state.clone()),
        headers.clone(),
        Some(axum::Json(body)),
    )
    .await
    .expect("create");
    let created = res.0;
    let id = created
        .get("id")
        .and_then(|v| v.as_str())
        .expect("id")
        .to_string();

    // Get user via handler
    let path = {
        let mut m = HashMap::new();
        m.insert("userId".to_string(), id.clone());
        m
    };
    let res = users::get_user_by_id(
        axum::Extension(arc_state.clone()),
        headers.clone(),
        axum::extract::Path(path.clone()),
    )
    .await
    .expect("get");
    let got = res.0;
    assert_eq!(
        got.get("username").and_then(|v| v.as_str()),
        Some("inttest")
    );

    // Update user display name
    let update_body = serde_json::json!({ "display_name": "Updated" });
    let res = users::update_user(
        axum::Extension(arc_state.clone()),
        headers.clone(),
        axum::extract::Path(path.clone()),
        Some(axum::Json(update_body)),
    )
    .await
    .expect("update");
    let upd = res.0;
    assert_eq!(
        upd.get("display_name").and_then(|v| v.as_str()),
        Some("Updated")
    );

    // Delete user (TestAuthenticator has admin scope)
    let res = users::delete_user(
        axum::Extension(arc_state.clone()),
        headers.clone(),
        axum::extract::Path(path),
    )
    .await
    .expect("delete");
    let del = res.0;
    assert_eq!(del.get("deleted").and_then(|v| v.as_bool()), Some(true));
}
