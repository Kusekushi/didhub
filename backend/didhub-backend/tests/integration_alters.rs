use didhub_backend::generated::routes::{create_alter, delete_alter, get_alter, update_alter};
use std::collections::HashMap;

mod support;

#[tokio::test]
async fn alters_crud_sqlite_in_memory() {
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

    let arc_state = support::test_state(&pool, &["admin"], None);

    let headers = support::auth_headers();

    // create alter
    let user_id = "00000000-0000-0000-0000-000000000002";
    let body = serde_json::json!({ "user_id": user_id, "name": "AlterName" });
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

    // get
    let mut path = HashMap::new();
    path.insert("alterId".to_string(), id.clone());
    let res = get_alter(
        axum::Extension(arc_state.clone()),
        headers.clone(),
        axum::extract::Path(path.clone()),
    )
    .await
    .expect("get");
    let got = res.0;
    assert_eq!(got.get("name").and_then(|v| v.as_str()), Some("AlterName"));

    // update
    let update_body = serde_json::json!({ "name": "UpdatedName" });
    let res = update_alter(
        axum::Extension(arc_state.clone()),
        headers.clone(),
        axum::extract::Path(path.clone()),
        Some(axum::Json(update_body)),
    )
    .await
    .expect("update");
    let upd = res.0;
    assert_eq!(
        upd.get("name").and_then(|v| v.as_str()),
        Some("UpdatedName")
    );

    // delete
    let res = delete_alter(
        axum::Extension(arc_state.clone()),
        headers.clone(),
        axum::extract::Path(path),
    )
    .await
    .expect("delete");
    let del = res.0;
    assert_eq!(del.get("deleted").and_then(|v| v.as_bool()), Some(true));
}
