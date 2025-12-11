use std::collections::HashMap;
use std::sync::Arc;

use tempfile::tempdir;

use didhub_db::{create_pool, DbConnectionConfig};
use didhub_log_client::LogToolClient;

use didhub_auth::TestAuthenticator;
use didhub_backend::handlers::uploads;
use didhub_backend::state::AppState;

use axum::extract::Path;
use axum::http::HeaderMap;

#[tokio::test]
async fn get_file_content_returns_200_and_content_type() {
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
        *px = image::Rgba([0, 128, 255, 255]);
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

    // Call content handler (no query params)
    let path_map = {
        let mut m = HashMap::new();
        m.insert("fileId".to_string(), file_id_s.clone());
        m
    };

    let resp = uploads::serve::serve_stored_file_content(
        axum::Extension(arc_state.clone()),
        HeaderMap::new(),
        Path(path_map),
        None,
    )
    .await
    .expect("content call");

    // Inspect response status and headers
    // Response is axum::response::Response
    let status = resp.status();
    assert_eq!(status, axum::http::StatusCode::OK);

    let headers = resp.headers();
    let ct = headers
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    // For images, the handler should return either image/jpeg (thumbnail) or image/png
    assert!(ct.starts_with("image/"), "unexpected content-type: {}", ct);

    // Ensure body is non-empty
    // Convert response body to bytes
    let body = resp.into_body();
    let collected = axum::body::to_bytes(body, usize::MAX)
        .await
        .expect("read body");
    assert!(!collected.is_empty(), "response body empty");
}
