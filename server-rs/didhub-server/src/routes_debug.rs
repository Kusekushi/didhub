use axum::{Extension, Json};
use didhub_middleware::types::AdminFlag;
use serde::Serialize;
use tracing::{debug, info};

#[derive(Serialize)]
pub struct WhoAmI {
    pub username: String,
    pub is_admin: bool,
}

pub async fn whoami(
    Extension(username): Extension<String>,
    ext: Option<Extension<AdminFlag>>,
) -> Json<WhoAmI> {
    let is_admin = ext.is_some();

    debug!(
        username = %username,
        is_admin = is_admin,
        "Debug whoami endpoint called"
    );

    info!(
        username = %username,
        is_admin = is_admin,
        "User identity information retrieved"
    );

    Json(WhoAmI { username, is_admin })
}
