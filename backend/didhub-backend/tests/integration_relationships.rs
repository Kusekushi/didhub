use didhub_backend::generated::routes::{
    create_relationship, delete_relationship, update_relationship,
};
use didhub_backend::handlers::relationships::get_by_id;
use std::collections::HashMap;

mod support;

#[tokio::test]
async fn relationships_crud_sqlite_in_memory() {
    let pool = support::sqlite_pool().await;

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

    let arc_state = support::test_state(&pool, &["admin"], None);

    let headers = support::auth_headers();

    // insert custom type
    sqlx::query(
        "INSERT INTO instance_settings (key, value_type, value_string, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    )
    .bind("custom_relationship_types")
    .bind("string")
    .bind("[{\"value\": \"friend\", \"label\": \"Friend\"}, {\"value\": \"colleague\", \"label\": \"Colleague\"}]")
    .bind("2024-01-01T00:00:00Z")
    .bind("2024-01-01T00:00:00Z")
    .execute(&pool)
    .await
    .expect("insert custom types");

    // create relationship
    let body = serde_json::json!({ "relation_type": "friend", "side_a_user_id": "00000000-0000-0000-0000-000000000002", "side_b_user_id": "00000000-0000-0000-0000-000000000003" });
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

    // get
    let mut path = HashMap::new();
    path.insert("relationshipId".to_string(), id.clone());
    let res = get_by_id::get_by_id(
        axum::Extension(arc_state.clone()),
        headers.clone(),
        axum::extract::Path(path.clone()),
    )
    .await
    .expect("get");
    let got = res.0;
    assert_eq!(
        got.get("relationType").and_then(|v| v.as_str()),
        Some("friend")
    );

    // update
    let update_body = serde_json::json!({ "type": "colleague" });
    let res = update_relationship(
        axum::Extension(arc_state.clone()),
        headers.clone(),
        axum::extract::Path(path.clone()),
        Some(axum::Json(update_body)),
    )
    .await
    .expect("update");
    let upd = res.0;
    assert_eq!(
        upd.get("relationType").and_then(|v| v.as_str()),
        Some("colleague")
    );

    // delete
    let res = delete_relationship(
        axum::Extension(arc_state.clone()),
        headers.clone(),
        axum::extract::Path(path),
    )
    .await
    .expect("delete");
    let del = res.0;
    assert_eq!(del.get("deleted").and_then(|v| v.as_bool()), Some(true));
}
