use std::collections::HashMap;
use std::sync::Arc;

use axum::{extract::Extension, http::HeaderMap};
use didhub_auth::TestAuthenticator;
use didhub_backend::handlers::subsystems;
use didhub_backend::state::AppState;
use didhub_db::{create_pool, DbConnectionConfig};
use didhub_log_client::LogToolClient;
use uuid::Uuid;

async fn setup() -> (Arc<AppState>, sqlx::Pool<sqlx::Sqlite>) {
    let config = DbConnectionConfig::new("sqlite::memory:");
    let pool = create_pool(&config).await.expect("create pool");

    // users table (minimal columns used by tests)
    sqlx::query(
        r#"CREATE TABLE users (
            id TEXT PRIMARY KEY,
            username TEXT NOT NULL,
            password_hash TEXT NOT NULL,
            roles TEXT NOT NULL,
            created_at TEXT NOT NULL
        )"#,
    )
    .execute(&pool)
    .await
    .expect("create users table");

    sqlx::query(
        r#"CREATE TABLE subsystems (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            owner_user_id TEXT,
            created_at TEXT NOT NULL
        )"#,
    )
    .execute(&pool)
    .await
    .expect("create subsystems table");

    let log_dir = std::env::temp_dir().join("didhub_test_logs_subsystems");
    std::fs::create_dir_all(&log_dir).expect("create log dir");
    let log = LogToolClient::new(log_dir.to_str().unwrap());

    let authenticator =
        Arc::from(Box::new(TestAuthenticator::new_with_scopes(
            vec!["admin".to_string()],
        )) as Box<dyn didhub_auth::AuthenticatorTrait>);
    let state = AppState::new(
        pool.clone(),
        log,
        authenticator,
        didhub_job_queue::JobQueueClient::new(),
        didhub_updates::UpdateCoordinator::new(),
    );

    (Arc::new(state), pool)
}

#[tokio::test]
async fn list_subsystems_filters_and_pagination() {
    let (state, pool) = setup().await;

    // create two owners
    let owner_a = Uuid::new_v4();
    let owner_b = Uuid::new_v4();

    sqlx::query(
        "INSERT INTO users (id, username, password_hash, roles, created_at) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(owner_a)
    .bind("owner_a")
    .bind("hash")
    .bind("[\"system\", \"user\"]")
    .bind("2024-01-01T00:00:00Z")
    .execute(&pool)
    .await
    .expect("insert user a");

    sqlx::query(
        "INSERT INTO users (id, username, password_hash, roles, created_at) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(owner_b)
    .bind("owner_b")
    .bind("hash")
    .bind("[\"system\", \"user\"]")
    .bind("2024-01-01T00:00:00Z")
    .execute(&pool)
    .await
    .expect("insert user b");

    // Insert subsystems: some matching "alpha" and owner_a, others different
    let now = "2024-01-01T00:00:00Z".to_string();
    let subs = vec![
        (Uuid::new_v4(), "Alpha Team", Some(owner_a)),
        (Uuid::new_v4(), "alpha squad", Some(owner_a)),
        (Uuid::new_v4(), "Beta Group", Some(owner_b)),
        (Uuid::new_v4(), "Gamma", None),
        (Uuid::new_v4(), "Alpha Extra", Some(owner_a)),
    ];

    for (id, name, owner_opt) in subs {
        sqlx::query(
            "INSERT INTO subsystems (id, name, owner_user_id, created_at) VALUES (?, ?, ?, ?)",
        )
        .bind(id)
        .bind(name)
        .bind(owner_opt)
        .bind(now.clone())
        .execute(&pool)
        .await
        .expect("insert subsystem");
    }

    // Call list_subsystems with name filter "alpha" and perPage=2, page=1
    let mut query = HashMap::new();
    query.insert("name".to_string(), "alpha".to_string());
    query.insert("perPage".to_string(), "2".to_string());
    query.insert("page".to_string(), "1".to_string());

    let res = subsystems::list::list(
        Extension(state.clone()),
        HeaderMap::new(),
        Some(axum::extract::Query(query.clone())),
    )
    .await
    .expect("list");
    let body = res.0;
    let items = body
        .get("items")
        .and_then(|v| v.as_array())
        .expect("items array");
    let pagination = body.get("pagination").expect("pagination");
    assert_eq!(items.len(), 2);
    assert_eq!(pagination.get("page").and_then(|v| v.as_i64()), Some(1));
    assert_eq!(pagination.get("perPage").and_then(|v| v.as_i64()), Some(2));
    assert_eq!(pagination.get("total").and_then(|v| v.as_i64()), Some(3)); // three "alpha" items

    // Page 2 should have the remaining 1 item
    query.insert("page".to_string(), "2".to_string());
    let res2 = subsystems::list::list(
        Extension(state.clone()),
        HeaderMap::new(),
        Some(axum::extract::Query(query.clone())),
    )
    .await
    .expect("list page2");
    let body2 = res2.0;
    let items2 = body2
        .get("items")
        .and_then(|v| v.as_array())
        .expect("items array");
    assert_eq!(items2.len(), 1);

    // Filter by owner_user_id = owner_a (should return 3 items total)
    let mut query_owner = HashMap::new();
    query_owner.insert("owner_user_id".to_string(), owner_a.to_string());
    let res_owner = subsystems::list::list(
        Extension(state.clone()),
        HeaderMap::new(),
        Some(axum::extract::Query(query_owner)),
    )
    .await
    .expect("list by owner");
    let body_owner = res_owner.0;
    let items_owner = body_owner
        .get("items")
        .and_then(|v| v.as_array())
        .expect("items array");
    // owner_a has three subsystems inserted above
    assert_eq!(
        body_owner
            .get("pagination")
            .and_then(|v| v.get("total"))
            .and_then(|v| v.as_i64()),
        Some(3)
    );
    assert_eq!(items_owner.len(), 3);
}
