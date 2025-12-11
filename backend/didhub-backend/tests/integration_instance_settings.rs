use std::collections::HashMap;
use std::sync::Arc;
use std::sync::Arc as StdArc;

use axum::{extract::Path, http::HeaderMap, Json};
use chrono::Utc;
use didhub_auth::{AuthenticatorTrait, TestAuthenticator};
use didhub_backend::{
    generated::routes::{
        bulk_get_instance_settings, bulk_set_instance_settings, get_instance_setting,
        list_instance_settings, set_instance_setting,
    },
    state::AppState,
};
use didhub_db::{create_pool, DbConnectionConfig, DbPool};
use didhub_job_queue::JobQueueClient;
use didhub_log_client::LogToolClient;
use didhub_updates::UpdateCoordinator;
use serde_json::json;
use tempfile::TempDir;
use uuid::Uuid;

struct TestContext {
    state: Arc<AppState>,
    pool: DbPool,
    _temp_dir: TempDir,
}

async fn setup(scopes: Vec<String>) -> TestContext {
    let temp_dir = TempDir::new().expect("create temp dir");
    let db_url = format!(
        "sqlite://file:instance_settings_{}?mode=memory&cache=shared",
        Uuid::new_v4()
    );
    let config = DbConnectionConfig::new(db_url);

    let pool = create_pool(&config).await.expect("create pool");

    sqlx::query(
        "CREATE TABLE instance_settings (
            key TEXT PRIMARY KEY,
            value_type TEXT NOT NULL,
            value_bool INTEGER,
            value_number REAL,
            value_string TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )",
    )
    .execute(&pool)
    .await
    .expect("create instance_settings");

    let log_client = LogToolClient::new(temp_dir.path().join("log_tool_stub"));
    let authenticator: StdArc<dyn AuthenticatorTrait> =
        StdArc::new(TestAuthenticator::new_with_scopes(scopes));
    let job_queue = JobQueueClient::new();
    let updates = UpdateCoordinator::new();

    let state = Arc::new(AppState::new(
        pool.clone(),
        log_client,
        authenticator,
        job_queue,
        updates,
    ));

    TestContext {
        state,
        pool,
        _temp_dir: temp_dir,
    }
}

fn admin_headers() -> HeaderMap {
    let mut headers = HeaderMap::new();
    headers.insert("authorization", "Bearer token".parse().unwrap());
    headers
}

#[tokio::test]
async fn list_instance_settings_returns_all() {
    let ctx = setup(vec!["admin".to_string()]).await;

    let now = Utc::now().to_rfc3339();

    sqlx::query("INSERT INTO instance_settings (key, value_type, value_bool, value_number, value_string, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .bind("featureFlag")
        .bind("bool")
        .bind(Some(1))
        .bind::<Option<f64>>(None)
        .bind::<Option<String>>(None)
        .bind(&now)
        .bind(&now)
        .execute(&ctx.pool)
        .await
        .unwrap();

    sqlx::query("INSERT INTO instance_settings (key, value_type, value_bool, value_number, value_string, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .bind("maxUsers")
        .bind("number")
        .bind::<Option<i32>>(None)
        .bind(Some(42))
        .bind::<Option<String>>(None)
        .bind(&now)
        .bind(&now)
        .execute(&ctx.pool)
        .await
        .unwrap();

    let response =
        list_instance_settings(axum::extract::Extension(ctx.state.clone()), admin_headers())
            .await
            .unwrap();

    let body = response.0;
    let items = body.get("items").and_then(|v| v.as_array()).unwrap();
    assert_eq!(items.len(), 2);

    let feature_flag = items
        .iter()
        .find(|item| item.get("key").unwrap() == "featureFlag")
        .unwrap();
    assert_eq!(feature_flag.get("value").unwrap(), "true");

    let max_users = items
        .iter()
        .find(|item| item.get("key").unwrap() == "maxUsers")
        .unwrap();
    assert_eq!(max_users.get("value").unwrap(), "42");
}

#[tokio::test]
async fn set_instance_setting_upserts_value() {
    let ctx = setup(vec!["admin".to_string()]).await;

    let headers = admin_headers();

    let body = json!({
        "key": "supportEmail",
        "value": "help@example.com"
    });

    let result = set_instance_setting(
        axum::extract::Extension(ctx.state.clone()),
        headers.clone(),
        Path(HashMap::from([(
            "key".to_string(),
            "supportEmail".to_string(),
        )])),
        Some(Json(body.clone())),
    )
    .await
    .unwrap();

    assert_eq!(result.0.get("value").unwrap(), "help@example.com");

    let update_body = json!({
        "key": "supportEmail",
        "value": "helpdesk@example.com"
    });

    let updated = set_instance_setting(
        axum::extract::Extension(ctx.state.clone()),
        headers,
        Path(HashMap::from([(
            "key".to_string(),
            "supportEmail".to_string(),
        )])),
        Some(Json(update_body)),
    )
    .await
    .unwrap();

    assert_eq!(updated.0.get("value").unwrap(), "helpdesk@example.com");

    let stored: (String, String) =
        sqlx::query_as("SELECT key, value_string FROM instance_settings WHERE key = ?")
            .bind("supportEmail")
            .fetch_one(&ctx.pool)
            .await
            .unwrap();

    assert_eq!(stored.1, "helpdesk@example.com");
}

#[tokio::test]
async fn bulk_set_instance_settings_parses_types() {
    let ctx = setup(vec!["admin".to_string()]).await;

    let body = json!({
        "items": [
            {"key": "featureFlag", "value": "true"},
            {"key": "maxUsers", "value": "25"},
            {"key": "welcomeMessage", "value": "Hello"}
        ]
    });

    let response = bulk_set_instance_settings(
        axum::extract::Extension(ctx.state.clone()),
        admin_headers(),
        Some(Json(body)),
    )
    .await
    .unwrap();

    let items = response.0.get("items").and_then(|v| v.as_array()).unwrap();
    assert_eq!(items.len(), 3);

    let row: (String, String, Option<i32>, Option<f64>, Option<String>) = sqlx::query_as(
        "SELECT key, value_type, value_bool, value_number, value_string FROM instance_settings WHERE key = ?",
    )
    .bind("featureFlag")
    .fetch_one(&ctx.pool)
    .await
    .unwrap();
    assert_eq!(row.1, "bool");
    assert_eq!(row.2, Some(1));

    let max_users: (String, String, Option<i32>, Option<f64>, Option<String>) = sqlx::query_as(
        "SELECT key, value_type, value_bool, value_number, value_string FROM instance_settings WHERE key = ?",
    )
    .bind("maxUsers")
    .fetch_one(&ctx.pool)
    .await
    .unwrap();
    assert_eq!(max_users.1, "number");
    assert_eq!(max_users.3, Some(25.0));

    let welcome: (String, String, Option<i32>, Option<f64>, Option<String>) = sqlx::query_as(
        "SELECT key, value_type, value_bool, value_number, value_string FROM instance_settings WHERE key = ?",
    )
    .bind("welcomeMessage")
    .fetch_one(&ctx.pool)
    .await
    .unwrap();
    assert_eq!(welcome.1, "string");
    assert_eq!(welcome.4.as_deref(), Some("Hello"));
}

#[tokio::test]
async fn bulk_get_instance_settings_returns_requested_keys() {
    let ctx = setup(vec!["admin".to_string()]).await;

    let now = Utc::now().to_rfc3339();

    sqlx::query("INSERT INTO instance_settings (key, value_type, value_bool, value_number, value_string, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .bind("featureFlag")
        .bind("bool")
        .bind(Some(0))
        .bind::<Option<f64>>(None)
        .bind::<Option<String>>(None)
        .bind(&now)
        .bind(&now)
        .execute(&ctx.pool)
        .await
        .unwrap();

    sqlx::query("INSERT INTO instance_settings (key, value_type, value_bool, value_number, value_string, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .bind("welcomeMessage")
        .bind("string")
        .bind::<Option<i32>>(None)
        .bind::<Option<f64>>(None)
        .bind(Some("Hi".to_string()))
        .bind(&now)
        .bind(&now)
        .execute(&ctx.pool)
        .await
        .unwrap();

    let body = json!({ "keys": ["featureFlag", "missing", "welcomeMessage"] });

    let response = bulk_get_instance_settings(
        axum::extract::Extension(ctx.state.clone()),
        admin_headers(),
        Some(Json(body)),
    )
    .await
    .unwrap();

    let values = response.0.get("values").and_then(|v| v.as_array()).unwrap();
    assert_eq!(values.len(), 2);

    assert!(values
        .iter()
        .any(|value| value.get("key") == Some(&json!("featureFlag"))));
    assert!(values
        .iter()
        .any(|value| value.get("key") == Some(&json!("welcomeMessage"))));
}

#[tokio::test]
async fn get_instance_setting_returns_value() {
    let ctx = setup(vec!["admin".to_string()]).await;

    let now = Utc::now().to_rfc3339();

    sqlx::query("INSERT INTO instance_settings (key, value_type, value_bool, value_number, value_string, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .bind("maxUsers")
        .bind("number")
        .bind::<Option<i32>>(None)
        .bind(Some(10))
        .bind::<Option<String>>(None)
        .bind(&now)
        .bind(&now)
        .execute(&ctx.pool)
        .await
        .unwrap();

    let response = get_instance_setting(
        axum::extract::Extension(ctx.state.clone()),
        admin_headers(),
        Path(HashMap::from([("key".to_string(), "maxUsers".to_string())])),
    )
    .await
    .unwrap();

    assert_eq!(response.0.get("value").unwrap(), "10");
}
