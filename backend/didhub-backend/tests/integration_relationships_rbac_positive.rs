use std::collections::HashMap;
use std::sync::Arc;

use didhub_db::{create_pool, DbConnectionConfig};
use didhub_log_client::LogToolClient;

use didhub_auth::TestAuthenticator;
use didhub_backend::generated::routes::{
    create_relationship, delete_relationship, update_relationship,
};
use didhub_backend::state::AppState;

#[tokio::test]
async fn owner_and_admin_can_modify_relationship() {
    let config = DbConnectionConfig::new("sqlite::memory:");
    let pool = create_pool(&config).await.expect("create pool");

    sqlx::query(
        r#"CREATE TABLE relationships (
            id TEXT PRIMARY KEY,
            type TEXT NOT NULL,
            side_a_user_id TEXT,
            side_a_alter_id TEXT,
            side_b_user_id TEXT,
            side_b_alter_id TEXT,
            past_life INTEGER,
            created_by TEXT,
            created_at TEXT NOT NULL
        )"#,
    )
    .execute(&pool)
    .await
    .expect("create table");

    let log_dir = std::env::temp_dir().join("didhub_test_logs");
    std::fs::create_dir_all(&log_dir).expect("create log dir");
    let log = LogToolClient::new(log_dir.to_str().unwrap());

    // owner creates the relationship
    let owner_id = "00000000-0000-0000-0000-000000000030";
    let owner_auth = std::sync::Arc::from(Box::new(TestAuthenticator::new_with(
        vec!["user".to_string()],
        Some(uuid::Uuid::parse_str(owner_id).unwrap()),
    )) as Box<dyn didhub_auth::AuthenticatorTrait>);
    let state = AppState::new(
        pool.clone(),
        log.clone(),
        owner_auth,
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

    let body = serde_json::json!({ "side_a_user_id": owner_id, "side_b_user_id": "00000000-0000-0000-0000-000000000031", "relation_type": "friend", "created_by": owner_id });
    let res = create_relationship(
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

    // Update as owner (should succeed)
    let mut path = HashMap::new();
    path.insert("relationshipId".to_string(), id.clone());
    let update_body = serde_json::json!({ "type": "partner" });

    let update_res = update_relationship(
        axum::Extension(arc_state.clone()),
        headers.clone(),
        axum::extract::Path(path.clone()),
        Some(axum::Json(update_body)),
    )
    .await;
    assert!(update_res.is_ok());

    // Now attempt delete as admin
    let admin_auth = std::sync::Arc::from(Box::new(TestAuthenticator::new_with(
        vec!["admin".to_string()],
        None,
    )) as Box<dyn didhub_auth::AuthenticatorTrait>);
    let state2 = AppState::new(
        pool.clone(),
        log,
        admin_auth,
        didhub_job_queue::JobQueueClient::new(),
        didhub_updates::UpdateCoordinator::new(),
    );
    let arc_state2 = Arc::new(state2);

    // Headers for admin
    let mut headers2 = axum::http::HeaderMap::new();
    headers2.insert(
        axum::http::header::AUTHORIZATION,
        axum::http::HeaderValue::from_static("Bearer test-token"),
    );

    let delete_res = delete_relationship(
        axum::Extension(arc_state2.clone()),
        headers2,
        axum::extract::Path(path.clone()),
    )
    .await;
    assert!(delete_res.is_ok());
}
