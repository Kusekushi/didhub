use std::collections::HashMap;
use std::sync::Arc;

use tempfile::tempdir;

use didhub_db::{create_pool, DbConnectionConfig};
use didhub_log_client::LogToolClient;

use didhub_auth::TestAuthenticator;
use didhub_backend::handlers::uploads;
use didhub_backend::state::AppState;

use axum::extract::Query;

#[tokio::test]
async fn batch_files_happy_path_creates_thumbnail_and_returns_url() {
    // DB pool in memory
    let config = DbConnectionConfig::new("sqlite::memory:");
    let pool = create_pool(&config).await.expect("create pool");

    // create minimal stored_files table used by handlers
    sqlx::query(
        r#"CREATE TABLE stored_files (
            id TEXT PRIMARY KEY,
            file_hash TEXT NOT NULL,
            mime_type TEXT,
            size REAL,
            created_at TEXT NOT NULL
        )"#,
    )
    .execute(&pool)
    .await
    .expect("create stored_files table");

    // create temp uploads dir and point config env var to it
    let td = tempdir().expect("tempdir");
    let uploads_dir = td.path().to_path_buf();
    std::env::set_var("DIDHUB_UPLOADS_DIRECTORY", uploads_dir.to_str().unwrap());

    // create a small PNG image file for testing
    let file_id = uuid::Uuid::new_v4();
    let file_id_s = file_id.to_string();
    let mut img = image::RgbaImage::new(10, 10);
    for px in img.pixels_mut() {
        *px = image::Rgba([255, 0, 0, 255]);
    }
    let dyn_img = image::DynamicImage::ImageRgba8(img);
    let mut buf: Vec<u8> = Vec::new();
    dyn_img
        .write_to(&mut std::io::Cursor::new(&mut buf), image::ImageFormat::Png)
        .expect("encode image");

    let mut file_path = uploads_dir.clone();
    file_path.push(file_id.to_string());
    std::fs::write(&file_path, &buf).expect("write file");

    // insert stored_files row
    let now = chrono::Utc::now().to_rfc3339();
    sqlx::query("INSERT INTO stored_files (id, file_hash, mime_type, size, created_at) VALUES (?, ?, ?, ?, ?)")
        .bind(file_id)
        .bind("hash")
        .bind("image/png")
        .bind(0.0f64)
        .bind(now)
        .execute(&pool)
        .await
        .expect("insert stored_file");

    // Build AppState with TestAuthenticator (admin)
    let log_dir = std::env::temp_dir().join("didhub_test_logs");
    std::fs::create_dir_all(&log_dir).expect("create log dir");
    let log = LogToolClient::new(log_dir.to_str().unwrap());
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

    // Call batch handler
    let mut qmap = HashMap::new();
    qmap.insert("ids".to_string(), file_id_s.clone());
    let res = uploads::serve_stored_files_batch(
        axum::Extension(arc_state.clone()),
        axum::http::HeaderMap::new(),
        Some(Query(qmap)),
    )
    .await
    .expect("batch call");

    let json = res.0;
    let arr = json.as_array().expect("array");
    assert_eq!(arr.len(), 1);
    let obj = &arr[0];
    assert_eq!(
        obj.get("file_id").and_then(|v| v.as_str()),
        Some(file_id_s.as_str())
    );
    // debug output for returned object
    println!("returned obj = {}", obj);
    let url = obj.get("url").and_then(|v| v.as_str()).expect("url");
    assert!(url.contains(&format!("/api/files/content/{}", file_id)));

    // Verify thumbnail file exists under uploads/thumbnails
    let mut thumb_path = uploads_dir.clone();
    thumb_path.push("thumbnails");
    thumb_path.push(format!("{file_id}_{}x{}.jpg", 160, 160));
    assert!(thumb_path.exists());
}

#[tokio::test]
async fn batch_files_missing_file_returns_error_entry() {
    let config = DbConnectionConfig::new("sqlite::memory:");
    let pool = create_pool(&config).await.expect("create pool");
    // create stored_files table
    sqlx::query(
        r#"CREATE TABLE stored_files (
            id TEXT PRIMARY KEY,
            file_hash TEXT NOT NULL,
            mime_type TEXT,
            size REAL,
            created_at TEXT NOT NULL
        )"#,
    )
    .execute(&pool)
    .await
    .expect("create stored_files table");

    let log_dir = std::env::temp_dir().join("didhub_test_logs");
    std::fs::create_dir_all(&log_dir).expect("create log dir");
    let log = LogToolClient::new(log_dir.to_str().unwrap());
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

    // Call batch with a non-existent id
    let missing = uuid::Uuid::new_v4();
    let missing_s = missing.to_string();
    let mut qmap = HashMap::new();
    qmap.insert("ids".to_string(), missing_s.clone());
    let res = uploads::serve_stored_files_batch(
        axum::Extension(arc_state.clone()),
        axum::http::HeaderMap::new(),
        Some(Query(qmap)),
    )
    .await
    .expect("batch call");

    let json = res.0;
    let arr = json.as_array().expect("array");
    assert_eq!(arr.len(), 1);
    let obj = &arr[0];
    assert_eq!(
        obj.get("file_id").and_then(|v| v.as_str()),
        Some(missing_s.as_str())
    );
    assert!(obj.get("error").is_some());
}
