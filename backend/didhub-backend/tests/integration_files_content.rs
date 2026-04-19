use didhub_backend::handlers::uploads;
use std::collections::HashMap;

use axum::extract::Path;
use axum::http::HeaderMap;

mod support;

#[tokio::test]
async fn get_file_content_returns_200_and_content_type() {
    let ctx = support::upload_test_context().await;
    let (file_id, file_id_s) = support::write_png_file(&ctx.uploads_dir, [0, 128, 255, 255]);
    support::insert_stored_file(&ctx.pool, file_id, "image/png").await;

    // Call content handler (no query params)
    let path_map = {
        let mut m = HashMap::new();
        m.insert("fileId".to_string(), file_id_s.clone());
        m
    };

    let resp = uploads::serve::serve_stored_file_content(
        axum::Extension(ctx.state.clone()),
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
