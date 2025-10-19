use std::collections::HashMap;
use std::sync::Arc;

use didhub_db::{create_pool, DbConnectionConfig};
use didhub_log_client::LogToolClient;

use didhub_auth::TestAuthenticator;
use didhub_backend::handlers::relationships;
use didhub_backend::state::AppState;

#[tokio::test]
async fn relationships_rbac_denied_for_non_creator() {
    let config = DbConnectionConfig::new("sqlite::memory:");
    let pool = create_pool(&config).await.expect("create pool");

    sqlx::query(
        r#"CREATE TABLE relationships (
            id TEXT PRIMARY KEY,
            type TEXT NOT NULL,
            side_a_user_id TEXT,
            side_b_user_id TEXT,
            side_a_alter_id TEXT,
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

    // create as admin
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

    let body = serde_json::json!({ "relation_type": "friend", "side_a_user_id": "00000000-0000-0000-0000-000000000002", "side_b_user_id": "00000000-0000-0000-0000-000000000003", "created_by": "00000000-0000-0000-0000-000000000020" });
    let res = relationships::create_relationship(
        axum::Extension(arc_state.clone()),
        axum::http::HeaderMap::new(),
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

    let mut path = HashMap::new();
    path.insert("relationshipId".to_string(), id.clone());
    let update_body = serde_json::json!({ "type": "enemy" });

    let result = relationships::update_relationship(
        axum::Extension(arc_state2.clone()),
        axum::http::HeaderMap::new(),
        axum::extract::Path(path.clone()),
        Some(axum::Json(update_body)),
    )
    .await;
    assert!(result.is_err());
}
