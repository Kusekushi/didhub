use std::collections::HashMap;
use std::sync::Arc;

use axum::{extract::Extension, http::HeaderMap, Json};
use didhub_auth::TestAuthenticator;
use didhub_backend::{
    generated::routes::{
        add_affiliation_member, create_affiliation, delete_affiliation, remove_affiliation_member,
        update_affiliation,
    },
    handlers::affiliations::list,
    state::AppState,
};
use didhub_db::{create_pool, DbConnectionConfig};
use didhub_log_client::LogToolClient;
use serde_json::{json, Value};
use uuid::Uuid;

struct TestContext {
    state: Arc<AppState>,
    pool: sqlx::Pool<sqlx::Sqlite>,
    owner_id: Uuid,
}

async fn setup() -> TestContext {
    let config = DbConnectionConfig::new("sqlite::memory:");
    let pool = create_pool(&config).await.expect("create pool");

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
    .expect("create users table");

    sqlx::query(
        r#"CREATE TABLE affiliations (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            sigil TEXT,
            owner_user_id TEXT,
            created_at TEXT NOT NULL
        )"#,
    )
    .execute(&pool)
    .await
    .expect("create affiliations table");

    sqlx::query(
        r#"CREATE TABLE affiliation_members (
            affiliation_id TEXT NOT NULL,
            alter_id TEXT NOT NULL,
            is_leader INTEGER NOT NULL,
            added_at TEXT NOT NULL,
            PRIMARY KEY (affiliation_id, alter_id)
        )"#,
    )
    .execute(&pool)
    .await
    .expect("create affiliation_members table");

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
            triggers TEXT NOT NULL DEFAULT '[]',
            metadata TEXT NOT NULL DEFAULT '{}',
            soul_songs TEXT NOT NULL DEFAULT '[]',
            interests TEXT NOT NULL DEFAULT '[]',
            notes TEXT,
            images TEXT NOT NULL DEFAULT '[]',
            system_roles TEXT NOT NULL DEFAULT '[]',
            is_system_host INTEGER NOT NULL DEFAULT 0,
            is_dormant INTEGER NOT NULL DEFAULT 0,
            is_merged INTEGER NOT NULL DEFAULT 0,
            owner_user_id TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )"#,
    )
    .execute(&pool)
    .await
    .expect("create alters table");

    let owner_id = Uuid::new_v4();
    sqlx::query(
        r#"INSERT INTO users (
            id, username, about_me, password_hash, avatar,
            must_change_password,
            last_login_at, display_name, created_at,
            updated_at, roles, settings
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"#,
    )
    .bind(owner_id)
    .bind("system_user")
    .bind(None::<String>)
    .bind("hash")
    .bind(None::<String>)
    .bind(0)
    .bind(None::<String>)
    .bind(None::<String>)
    .bind("2024-01-01T00:00:00Z")
    .bind("2024-01-01T00:00:00Z")
    .bind("[\"system\", \"user\"]")
    .bind("{}")
    .execute(&pool)
    .await
    .expect("insert user");

    let log_dir = std::env::temp_dir().join("didhub_test_logs_affiliations");
    std::fs::create_dir_all(&log_dir).expect("create log dir");
    let log_client = LogToolClient::new(log_dir.to_str().unwrap());

    let authenticator = Arc::from(Box::new(TestAuthenticator::new_with(
        vec!["user".to_string()],
        Some(owner_id),
    )) as Box<dyn didhub_auth::AuthenticatorTrait>);
    let state = AppState::new(
        pool.clone(),
        log_client,
        authenticator,
        didhub_job_queue::JobQueueClient::new(),
        didhub_updates::UpdateCoordinator::new(),
    );

    TestContext {
        state: Arc::new(state),
        pool,
        owner_id,
    }
}

async fn create_sample_affiliation(state: Arc<AppState>) -> (Uuid, Value) {
    let payload = json!({
        "name": "Witchlight Society",
        "description": "Shared interests and support"
    });

    let response = create_affiliation(
        Extension(state.clone()),
        HeaderMap::new(),
        Some(Json(payload)),
    )
    .await
    .expect("create affiliation");

    let body = response.0;
    let id = body
        .get("id")
        .and_then(|v| v.as_str())
        .and_then(|s| Uuid::parse_str(s).ok())
        .expect("affiliation id");

    (id, body)
}

#[tokio::test]
async fn create_affiliation_as_system_user() {
    let ctx = setup().await;
    let (affiliation_id, body) = create_sample_affiliation(ctx.state.clone()).await;

    assert_eq!(
        body.get("name").and_then(|v| v.as_str()),
        Some("Witchlight Society")
    );
    assert_eq!(
        body.get("description").and_then(|v| v.as_str()),
        Some("Shared interests and support")
    );

    let rows: (String, Option<String>, Option<Uuid>) =
        sqlx::query_as("SELECT name, description, owner_user_id FROM affiliations WHERE id = ?")
            .bind(affiliation_id)
            .fetch_one(&ctx.pool)
            .await
            .expect("fetch affiliation row");

    assert_eq!(rows.0, "Witchlight Society");
    assert_eq!(rows.1, Some("Shared interests and support".to_string()));
    assert_eq!(rows.2, Some(ctx.owner_id));
}

#[tokio::test]
async fn update_affiliation_as_owner() {
    let ctx = setup().await;
    let (affiliation_id, _) = create_sample_affiliation(ctx.state.clone()).await;

    let mut path = HashMap::new();
    path.insert("affiliationId".to_string(), affiliation_id.to_string());
    let payload = json!({ "name": "Updated", "description": "New details" });

    let response = update_affiliation(
        Extension(ctx.state.clone()),
        HeaderMap::new(),
        axum::extract::Path(path.clone()),
        Some(Json(payload)),
    )
    .await
    .expect("update affiliation");

    let body = response.0;
    assert_eq!(body.get("name").and_then(|v| v.as_str()), Some("Updated"));
    assert_eq!(
        body.get("description").and_then(|v| v.as_str()),
        Some("New details")
    );

    let db_row: (String, Option<String>) =
        sqlx::query_as("SELECT name, description FROM affiliations WHERE id = ?")
            .bind(affiliation_id)
            .fetch_one(&ctx.pool)
            .await
            .expect("check updated affiliation");

    assert_eq!(db_row.0, "Updated");
    assert_eq!(db_row.1, Some("New details".to_string()));
}

#[tokio::test]
async fn delete_affiliation_removes_members() {
    let ctx = setup().await;
    let (affiliation_id, _) = create_sample_affiliation(ctx.state.clone()).await;

    let alter_id = Uuid::new_v4();

    // Insert the alter
    sqlx::query(
        r#"INSERT INTO alters (id, user_id, owner_user_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"#,
    )
    .bind(alter_id)
    .bind(ctx.owner_id)
    .bind(ctx.owner_id)
    .bind("Test Alter")
    .bind("2024-01-01T00:00:00Z")
    .bind("2024-01-01T00:00:00Z")
    .execute(&ctx.pool)
    .await
    .expect("insert alter");

    let mut path = HashMap::new();
    path.insert("affiliationId".to_string(), affiliation_id.to_string());

    let _ = add_affiliation_member(
        Extension(ctx.state.clone()),
        HeaderMap::new(),
        axum::extract::Path(path.clone()),
        Some(Json(json!({ "alterId": alter_id.to_string() }))),
    )
    .await
    .expect("add member");

    let count: (i64,) =
        sqlx::query_as("SELECT COUNT(*) FROM affiliation_members WHERE affiliation_id = ?")
            .bind(affiliation_id)
            .fetch_one(&ctx.pool)
            .await
            .expect("count members");
    assert_eq!(count.0, 1);

    let _ = delete_affiliation(
        Extension(ctx.state.clone()),
        HeaderMap::new(),
        axum::extract::Path(path.clone()),
    )
    .await
    .expect("delete affiliation");

    let remaining: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM affiliations WHERE id = ?")
        .bind(affiliation_id)
        .fetch_one(&ctx.pool)
        .await
        .expect("check remaining affiliation");
    assert_eq!(remaining.0, 0);

    let member_count: (i64,) =
        sqlx::query_as("SELECT COUNT(*) FROM affiliation_members WHERE affiliation_id = ?")
            .bind(affiliation_id)
            .fetch_one(&ctx.pool)
            .await
            .expect("remaining members");
    assert_eq!(member_count.0, 0);
}

#[tokio::test]
async fn add_and_remove_affiliation_member() {
    let ctx = setup().await;
    let (affiliation_id, _) = create_sample_affiliation(ctx.state.clone()).await;
    let alter_id = Uuid::new_v4();

    // Insert the alter
    sqlx::query(
        r#"INSERT INTO alters (id, user_id, owner_user_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"#,
    )
    .bind(alter_id)
    .bind(ctx.owner_id)
    .bind(ctx.owner_id)
    .bind("Test Alter")
    .bind("2024-01-01T00:00:00Z")
    .bind("2024-01-01T00:00:00Z")
    .execute(&ctx.pool)
    .await
    .expect("insert alter");

    let mut path = HashMap::new();
    path.insert("affiliationId".to_string(), affiliation_id.to_string());

    let response = add_affiliation_member(
        Extension(ctx.state.clone()),
        HeaderMap::new(),
        axum::extract::Path(path.clone()),
        Some(Json(json!({ "alterId": alter_id.to_string() }))),
    )
    .await
    .expect("add member");

    let response_id = response
        .0
        .get("id")
        .and_then(|v| v.as_str())
        .expect("response id");
    assert_eq!(response_id, affiliation_id.to_string());

    let member_count: (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM affiliation_members WHERE affiliation_id = ? AND alter_id = ?",
    )
    .bind(affiliation_id)
    .bind(alter_id)
    .fetch_one(&ctx.pool)
    .await
    .expect("member exists");
    assert_eq!(member_count.0, 1);

    let duplicate = add_affiliation_member(
        Extension(ctx.state.clone()),
        HeaderMap::new(),
        axum::extract::Path(path.clone()),
        Some(Json(json!({ "alterId": alter_id.to_string() }))),
    )
    .await;
    assert!(duplicate.is_err(), "adding duplicate member should fail");

    let _ = remove_affiliation_member(
        Extension(ctx.state.clone()),
        HeaderMap::new(),
        axum::extract::Path({
            let mut p = path.clone();
            p.insert("memberId".to_string(), alter_id.to_string());
            p
        }),
    )
    .await
    .expect("remove member");

    let remaining: (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM affiliation_members WHERE affiliation_id = ? AND alter_id = ?",
    )
    .bind(affiliation_id)
    .bind(alter_id)
    .fetch_one(&ctx.pool)
    .await
    .expect("member removed");
    assert_eq!(remaining.0, 0);

    let removal_missing = remove_affiliation_member(
        Extension(ctx.state.clone()),
        HeaderMap::new(),
        axum::extract::Path({
            let mut p = HashMap::new();
            p.insert("affiliationId".to_string(), affiliation_id.to_string());
            p.insert("memberId".to_string(), alter_id.to_string());
            p
        }),
    )
    .await;
    assert!(
        removal_missing.is_err(),
        "removing absent member should fail"
    );
}

#[tokio::test]
async fn list_affiliations_pagination_and_search_case_insensitive() {
    let ctx = setup().await;

    // Create multiple affiliations with varying cases
    let names = vec![
        "Alpha Club",
        "beta group",
        "Gamma Association",
        "delta society",
        "epsilon circle",
    ];

    for name in &names {
        let payload = json!({ "name": name, "description": "desc"});
        let _ = create_affiliation(
            Extension(ctx.state.clone()),
            HeaderMap::new(),
            Some(Json(payload)),
        )
        .await
        .expect("create affiliation");
    }

    // List first page perPage=2
    let mut query = HashMap::new();
    query.insert("page".to_string(), "1".to_string());
    query.insert("perPage".to_string(), "2".to_string());

    let response = list::list(
        Extension(ctx.state.clone()),
        HeaderMap::new(),
        Some(axum::extract::Query(query.clone())),
    )
    .await
    .expect("list affiliations");

    let body = response.0;
    let items = body
        .get("items")
        .and_then(|v| v.as_array())
        .expect("items array");
    let pagination = body
        .get("pagination")
        .and_then(|v| v.as_object())
        .expect("pagination");
    assert_eq!(items.len(), 2);
    assert_eq!(pagination.get("page").and_then(|v| v.as_u64()), Some(1));
    assert_eq!(pagination.get("perPage").and_then(|v| v.as_u64()), Some(2));

    // Test case-insensitive search: search for 'BETA' should match 'beta group'
    let mut q2 = HashMap::new();
    q2.insert("search".to_string(), "BETA".to_string());

    let resp2 = list::list(
        Extension(ctx.state.clone()),
        HeaderMap::new(),
        Some(axum::extract::Query(q2)),
    )
    .await
    .expect("search affiliations");

    let body2 = resp2.0;
    let items2 = body2
        .get("items")
        .and_then(|v| v.as_array())
        .expect("items array2");
    assert_eq!(items2.len(), 1);
    let first_name = items2[0].get("name").and_then(|v| v.as_str()).unwrap_or("");
    assert!(first_name.eq_ignore_ascii_case("beta group"));
}
