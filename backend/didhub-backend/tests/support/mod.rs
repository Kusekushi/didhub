#![allow(dead_code)]

use std::sync::Arc;

use axum::http::{header::AUTHORIZATION, HeaderMap, HeaderValue};
use didhub_auth::{auth::AuthenticatorTrait, TestAuthenticator};
use didhub_backend::state::AppState;
use didhub_db::{create_pool, DbConnectionConfig, DbPool};
use tempfile::TempDir;
use uuid::Uuid;

pub async fn sqlite_pool() -> DbPool {
    let config = DbConnectionConfig::new("sqlite::memory:");
    create_pool(&config).await.expect("create pool")
}

pub fn test_state(pool: &DbPool, scopes: &[&str], user_id: Option<Uuid>) -> Arc<AppState> {
    let authenticator = Arc::new(TestAuthenticator::new_with(
        scopes.iter().map(|scope| (*scope).to_string()).collect(),
        user_id,
    )) as Arc<dyn AuthenticatorTrait>;

    Arc::new(AppState::new(
        pool.clone(),
        authenticator,
        didhub_job_queue::JobQueueClient::new(),
        didhub_updates::UpdateCoordinator::new(),
        None,
    ))
}

#[allow(dead_code)]
pub fn auth_headers() -> HeaderMap {
    let mut headers = HeaderMap::new();
    headers.insert(AUTHORIZATION, HeaderValue::from_static("Bearer test-token"));
    headers
}

pub struct UploadTestContext {
    pub pool: DbPool,
    pub state: Arc<AppState>,
    pub uploads_dir: std::path::PathBuf,
    _temp_dir: TempDir,
}

pub async fn upload_test_context() -> UploadTestContext {
    let pool = sqlite_pool().await;
    create_stored_files_table(&pool).await;

    let temp_dir = tempfile::tempdir().expect("tempdir");
    let uploads_dir = temp_dir.path().to_path_buf();
    std::env::set_var(
        "DIDHUB_UPLOADS_DIRECTORY",
        uploads_dir.to_str().expect("uploads dir utf-8"),
    );

    let state = test_state(
        &pool,
        &["admin"],
        Some(Uuid::parse_str("00000000-0000-0000-0000-000000000001").expect("uuid")),
    );

    UploadTestContext {
        pool,
        state,
        uploads_dir,
        _temp_dir: temp_dir,
    }
}

pub async fn create_stored_files_table(pool: &DbPool) {
    sqlx::query(
        r#"CREATE TABLE stored_files (
            id TEXT PRIMARY KEY,
            file_hash TEXT NOT NULL,
            mime_type TEXT,
            size REAL,
            created_at TEXT NOT NULL
        )"#,
    )
    .execute(pool)
    .await
    .expect("create stored_files table");
}

pub fn write_png_file(uploads_dir: &std::path::Path, rgba: [u8; 4]) -> (Uuid, String) {
    let file_id = Uuid::new_v4();
    let file_id_s = file_id.to_string();
    let mut img = image::RgbaImage::new(10, 10);
    for px in img.pixels_mut() {
        *px = image::Rgba(rgba);
    }
    let dyn_img = image::DynamicImage::ImageRgba8(img);
    let mut buf: Vec<u8> = Vec::new();
    dyn_img
        .write_to(&mut std::io::Cursor::new(&mut buf), image::ImageFormat::Png)
        .expect("encode image");

    let mut file_path = uploads_dir.to_path_buf();
    file_path.push(&file_id_s);
    std::fs::write(&file_path, &buf).expect("write file");

    (file_id, file_id_s)
}

pub async fn insert_stored_file(pool: &DbPool, file_id: Uuid, mime_type: &str) {
    let now = chrono::Utc::now().to_rfc3339();
    sqlx::query(
        "INSERT INTO stored_files (id, file_hash, mime_type, size, created_at) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(file_id)
    .bind("hash")
    .bind(mime_type)
    .bind(0.0f64)
    .bind(now)
    .execute(pool)
    .await
    .expect("insert stored_file");
}
