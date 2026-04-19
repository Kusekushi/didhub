use didhub_backend::generated::routes::{create_relationship, update_relationship};
use std::collections::HashMap;

mod support;

#[tokio::test]
async fn relationships_rbac_denied_for_non_creator() {
    let pool = support::sqlite_pool().await;

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

    // create as admin
    let arc_state = support::test_state(&pool, &["admin"], None);

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

    let arc_state2 = support::test_state(&pool, &["user"], None);

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
