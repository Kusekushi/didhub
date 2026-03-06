use std::collections::HashMap;
use std::sync::Arc;

use didhub_db::{create_pool, DbConnectionConfig};

use didhub_auth::TestAuthenticator;
use didhub_backend::generated::routes::{create_relationship, update_relationship};
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

    sqlx::query(
        r#"CREATE TABLE instance_settings (
            key TEXT PRIMARY KEY,
            value_type TEXT NOT NULL,
            value_string TEXT,
            value_bool INTEGER,
            value_number REAL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )"#,
    )
    .execute(&pool)
    .await
    .expect("create instance_settings table");

    // insert custom type
    sqlx::query(
        "INSERT INTO instance_settings (key, value_type, value_string, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    )
    .bind("custom_relationship_types")
    .bind("string")
    .bind("[{\"value\": \"friend\", \"label\": \"Friend\"}, {\"value\": \"enemy\", \"label\": \"Enemy\"}]")
    .bind("2024-01-01T00:00:00Z")
    .bind("2024-01-01T00:00:00Z")
    .execute(&pool)
    .await
    .expect("insert custom types");

    let log_dir = std::env::temp_dir().join("didhub_test_logs");
    std::fs::create_dir_all(&log_dir).expect("create log dir");

    // create as admin
    let admin_auth =
        std::sync::Arc::new(TestAuthenticator::new_with_scopes(
            vec!["admin".to_string()],
        )) as Arc<dyn didhub_auth::auth::AuthenticatorTrait>;
    let state = AppState::new(
        pool.clone(),
        admin_auth,
        didhub_job_queue::JobQueueClient::new(),
        didhub_updates::UpdateCoordinator::new(),
        None,
    );
    let arc_state = Arc::new(state);

    let body = serde_json::json!({ "relation_type": "friend", "side_a_user_id": "00000000-0000-0000-0000-000000000002", "side_b_user_id": "00000000-0000-0000-0000-000000000003", "created_by": "00000000-0000-0000-0000-000000000020" });
    let res = create_relationship(
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
        std::sync::Arc::new(TestAuthenticator::new_with_scopes(vec!["user".to_string()]))
            as Arc<dyn didhub_auth::auth::AuthenticatorTrait>;
    let state2 = AppState::new(
        pool.clone(),
        nonadmin_auth,
        didhub_job_queue::JobQueueClient::new(),
        didhub_updates::UpdateCoordinator::new(),
        None,
    );
    let arc_state2 = Arc::new(state2);

    let mut path = HashMap::new();
    path.insert("relationshipId".to_string(), id.clone());
    let update_body = serde_json::json!({ "type": "enemy" });

    let result = update_relationship(
        axum::Extension(arc_state2.clone()),
        axum::http::HeaderMap::new(),
        axum::extract::Path(path.clone()),
        Some(axum::Json(update_body)),
    )
    .await;
    assert!(result.is_err());
}
