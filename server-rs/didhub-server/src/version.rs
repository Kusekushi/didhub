use axum::Json;
use serde::Serialize;
use std::sync::OnceLock;

static VERSION: OnceLock<String> = OnceLock::new();

fn app_version() -> &'static str {
    VERSION.get_or_init(|| env!("CARGO_PKG_VERSION").to_string())
}

#[derive(Serialize)]
pub struct VersionResponse {
    pub version: String,
}

pub async fn version_handler() -> Json<VersionResponse> {
    Json(VersionResponse {
        version: app_version().to_string(),
    })
}
