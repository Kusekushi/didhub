use didhub_error::AppError;
use axum::response::IntoResponse;
// serde_json::Value not needed here; removed to silence unused import warning

#[test]
fn app_error_into_response_not_found() {
    let r = AppError::NotFound.into_response();
    let status = r.status();
    assert_eq!(status.as_u16(), 404);
    // body exists but we can't easily decode without running async; ensure header present
    // check x-error-code header
    let resp = AppError::NotFound.into_response();
    let hv = resp.headers().get("x-error-code").unwrap().to_str().unwrap();
    assert_eq!(hv, "not_found");
}

#[test]
fn app_error_validation_body() {
    let e = AppError::validation(["one","two"]);
    let resp = e.into_response();
    assert_eq!(resp.status().as_u16(), 400);
    let hv = resp.headers().get("x-error-code").unwrap().to_str().unwrap();
    assert_eq!(hv, "validation_failed");
}
