use std::collections::HashMap;
use std::sync::Arc;

use didhub_db::{create_pool, DbConnectionConfig};
use didhub_log_client::LogToolClient;

use didhub_auth::TestAuthenticator;
use didhub_backend::generated::routes::{create_alter, update_alter};
use didhub_backend::state::AppState;

#[tokio::test]
async fn alters_rbac_denied_for_non_owner() {
    let config = DbConnectionConfig::new("sqlite::memory:");
    let pool = create_pool(&config).await.expect("create pool");

    sqlx::query(
        r#"CREATE TABLE alters (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            name TEXT NOT NULL,
            description TEXT,
            age TEXT,
            gender TEXT,
            pronouns TEXT,
            birthday TEXT,
            sexuality TEXT,
            species TEXT,
            alter_type TEXT,
            job TEXT,
            weapon TEXT,
            triggers TEXT NOT NULL,
            metadata TEXT NOT NULL,
            soul_songs TEXT NOT NULL,
            interests TEXT NOT NULL,
            notes TEXT,
            images TEXT NOT NULL,
            system_roles TEXT NOT NULL,
            is_system_host INTEGER NOT NULL,
            is_dormant INTEGER NOT NULL,
            is_merged INTEGER NOT NULL,
            owner_user_id TEXT NOT NULL,
            created_at TEXT NOT NULL
        )"#,
    )
    .execute(&pool)
    .await
    .expect("create table");

    let log_dir = std::env::temp_dir().join("didhub_test_logs");
    std::fs::create_dir_all(&log_dir).expect("create log dir");
    let log = LogToolClient::new(log_dir.to_str().unwrap());

    // Create with admin to set owner
    let admin_auth =
        std::sync::Arc::from(Box::new(TestAuthenticator::new_with_scopes(
            vec!["admin".to_string()],
        )) as Box<dyn didhub_auth::AuthenticatorTrait>);
    let state = AppState::new(
        pool.clone(),
        log.clone(),
        admin_auth,
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

    let owner_id = "00000000-0000-0000-0000-000000000010";
    let body = serde_json::json!({ "user_id": owner_id, "name": "OwnerAlter" });
    let res = create_alter(
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

    // Now attempt update with a non-admin different user
    let nonadmin_auth =
        std::sync::Arc::from(
            Box::new(TestAuthenticator::new_with_scopes(vec!["user".to_string()]))
                as Box<dyn didhub_auth::AuthenticatorTrait>,
        );
    let state2 = AppState::new(
        pool.clone(),
        log,
        nonadmin_auth,
        didhub_job_queue::JobQueueClient::new(),
        didhub_updates::UpdateCoordinator::new(),
    );
    let arc_state2 = Arc::new(state2);

    // Headers for non-admin user
    let mut headers2 = axum::http::HeaderMap::new();
    headers2.insert(
        axum::http::header::AUTHORIZATION,
        axum::http::HeaderValue::from_static("Bearer test-token"),
    );

    let mut path = HashMap::new();
    path.insert("alterId".to_string(), id.clone());
    let update_body = serde_json::json!({ "name": "HackerName" });

    let result = update_alter(
        axum::Extension(arc_state2.clone()),
        headers2,
        axum::extract::Path(path.clone()),
        Some(axum::Json(update_body)),
    )
    .await;
    assert!(result.is_err());
}
