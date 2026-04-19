use didhub_backend::handlers::uploads;
use std::collections::HashMap;

use axum::extract::Query;

mod support;

#[tokio::test]
async fn batch_files_happy_path_creates_thumbnail_and_returns_url() {
    let ctx = support::upload_test_context().await;
    let (file_id, file_id_s) = support::write_png_file(&ctx.uploads_dir, [255, 0, 0, 255]);
    support::insert_stored_file(&ctx.pool, file_id, "image/png").await;

    // Call batch handler
    let mut qmap = HashMap::new();
    qmap.insert("ids".to_string(), file_id_s.clone());
    let res = uploads::serve_batch::serve_stored_files_batch(
        axum::Extension(ctx.state.clone()),
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
    let mut thumb_path = ctx.uploads_dir.clone();
    thumb_path.push("thumbnails");
    thumb_path.push(format!("{file_id}_{}x{}.jpg", 160, 160));
    assert!(thumb_path.exists());
}

#[tokio::test]
async fn batch_files_missing_file_returns_error_entry() {
    let ctx = support::upload_test_context().await;

    // Call batch with a non-existent id
    let missing = uuid::Uuid::new_v4();
    let missing_s = missing.to_string();
    let mut qmap = HashMap::new();
    qmap.insert("ids".to_string(), missing_s.clone());
    let res = uploads::serve_batch::serve_stored_files_batch(
        axum::Extension(ctx.state.clone()),
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
