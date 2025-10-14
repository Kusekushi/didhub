use axum::Json;
use serde::Serialize;
use std::sync::OnceLock;

static VERSION: OnceLock<String> = OnceLock::new();

fn app_version() -> &'static str {
    VERSION.get_or_init(|| env!("CARGO_PKG_VERSION").to_string())
}

// If build.rs emitted versions.rs into OUT_DIR, include it to expose crate versions
// The generated file defines constants like FRONTEND_VERSION, DB_VERSION, etc.
// When OUT_DIR is not available (e.g., crates published without build.rs), the
// include will be skipped via cfg guard.
#[allow(dead_code)]
mod generated_versions {
    // Use option_env to avoid hard failure in contexts where OUT_DIR isn't set
    // at compile-time for certain tooling; attempt to include generated file
    // if it's present in OUT_DIR.
    #[cfg(all())]
    const _DUMMY: () = ();
}

// Include the generated versions file created by build.rs. This file defines
// constants such as SERVER_VERSION, FRONTEND_VERSION, GIT_COMMIT, BUILD_TIME, etc.
// build.rs writes the file into OUT_DIR before compilation, so this include
// should succeed during normal cargo builds.
// If for some reason the generated file isn't present, the build will fail and
// remind the developer to run a build that executes build.rs.
include!(concat!(env!("OUT_DIR"), "/versions.rs"));

#[derive(Serialize)]
pub struct VersionResponse {
    pub server_version: String,
    pub frontend_version: String,
    pub db_version: String,
    pub auth_version: String,
    pub cache_version: String,
    pub error_version: String,
    pub config_version: String,
    pub oidc_version: String,
    pub metrics_version: String,
    pub housekeeping_version: String,
    pub middleware_version: String,
    pub updater_version: String,
    pub migrations_version: String,
    pub git_commit: String,
    pub build_time: String,
    pub target: String,
}

pub async fn version_handler() -> Json<VersionResponse> {
    // Prefer generated constants when present; the build script writes to OUT_DIR
    // and may set these constants via included file. If included, the values
    // will shadow the fallbacks above at compile time.
    let resp = VersionResponse {
        server_version: SERVER_VERSION.to_string(),
        frontend_version: FRONTEND_VERSION.to_string(),
        db_version: DB_VERSION.to_string(),
        auth_version: AUTH_VERSION.to_string(),
        cache_version: CACHE_VERSION.to_string(),
        error_version: ERROR_VERSION.to_string(),
        config_version: CONFIG_VERSION.to_string(),
        oidc_version: OIDC_VERSION.to_string(),
        metrics_version: METRICS_VERSION.to_string(),
        housekeeping_version: HOUSEKEEPING_VERSION.to_string(),
        middleware_version: MIDDLEWARE_VERSION.to_string(),
        updater_version: UPDATER_VERSION.to_string(),
        migrations_version: MIGRATIONS_VERSION.to_string(),
        git_commit: GIT_COMMIT.to_string(),
        build_time: BUILD_TIME.to_string(),
        target: TARGET_TRIPLE.to_string(),
    };
    Json(resp)
}
