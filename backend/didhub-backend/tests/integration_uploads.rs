use std::collections::HashMap;
use std::sync::Arc;

use didhub_db::{create_pool, DbConnectionConfig};
use didhub_log_client::LogToolClient;

use didhub_auth::TestAuthenticator;
use didhub_backend::handlers::uploads;
use didhub_backend::state::AppState;

#[tokio::test]
async fn uploads_crud_sqlite_in_memory() {
    let config = DbConnectionConfig::new("sqlite::memory:");
    let pool = create_pool(&config).await.expect("create pool");

    // create minimal uploads table
    sqlx::query(
        r#"CREATE TABLE uploads (
            id TEXT PRIMARY KEY,
            stored_file_id TEXT NOT NULL,
            stored_name TEXT NOT NULL,
            uploaded_by TEXT NOT NULL,
            created_at TEXT NOT NULL
        )"#,
    )
    .execute(&pool)
    .await
    .expect("create table");

    let log_dir = std::env::temp_dir().join("didhub_test_logs");
    std::fs::create_dir_all(&log_dir).expect("create log dir");
    let log = LogToolClient::new(log_dir.to_str().unwrap());
    // give the test authenticator a fixed user id so handlers that require auth.user_id succeed
    let test_user_id = uuid::Uuid::parse_str("00000000-0000-0000-0000-000000000001").unwrap();
    let test_auth = std::sync::Arc::from(Box::new(TestAuthenticator::new_with(
        vec!["admin".to_string()],
        Some(test_user_id),
    )) as Box<dyn didhub_auth::AuthenticatorTrait>);
    let state = AppState::new(
        pool.clone(),
        log,
        test_auth,
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

    // create upload
    let body = serde_json::json!({ "stored_file_id": "00000000-0000-0000-0000-000000000001", "stored_name": "file.txt", "uploaded_by": "00000000-0000-0000-0000-000000000001" });
    let res = uploads::create::create(
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

    // get upload
    let mut path = HashMap::new();
    path.insert("uploadId".to_string(), id.clone());
    let res = uploads::get::get(
        axum::Extension(arc_state.clone()),
        headers.clone(),
        axum::extract::Path(path.clone()),
    )
    .await
    .expect("get");
    let got = res.0;
    assert_eq!(
        got.get("stored_name").and_then(|v| v.as_str()),
        Some("file.txt")
    );

    // delete upload
    let res = uploads::delete::delete(
        axum::Extension(arc_state.clone()),
        headers.clone(),
        axum::extract::Path(path),
        None,
    )
    .await
    .expect("delete");
    let del = res.0;
    assert_eq!(del.get("deleted").and_then(|v| v.as_bool()), Some(true));
}
