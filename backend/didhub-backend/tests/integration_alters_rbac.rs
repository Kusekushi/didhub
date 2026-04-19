use didhub_backend::generated::routes::{create_alter, update_alter};
use std::collections::HashMap;

mod support;

#[tokio::test]
async fn alters_rbac_denied_for_non_owner() {
    let pool = support::sqlite_pool().await;

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
            surname TEXT,
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

    // Create with admin to set owner
    let arc_state = support::test_state(&pool, &["admin"], None);

    let headers = support::auth_headers();

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
    let arc_state2 = support::test_state(&pool, &["user"], None);

    let headers2 = support::auth_headers();

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
