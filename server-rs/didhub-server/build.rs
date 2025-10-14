use std::fs;
use std::path::Path;

fn main() {
    // Read versions from Cargo.toml files
    fn get_crate_version(crate_path: &str) -> String {
        let path = Path::new(crate_path).join("Cargo.toml");
        if let Ok(content) = fs::read_to_string(&path) {
            for line in content.lines() {
                if line.trim().starts_with("version = ") {
                    let version = line
                        .trim()
                        .strip_prefix("version = ")
                        .unwrap()
                        .trim_matches('"');
                    return version.to_string();
                }
            }
        }
        "unknown".to_string()
    }

    // Read frontend version from package.json
    fn get_frontend_version() -> String {
        let path = Path::new("../../packages/frontend/package.json");
        if let Ok(content) = fs::read_to_string(&path) {
            if let Some(start) = content.find("\"version\": \"") {
                let start = start + 12;
                if let Some(end) = content[start..].find('"') {
                    return content[start..start + end].to_string();
                }
            }
        }
        "0.1.0".to_string()
    }

    let server_version = get_crate_version("../didhub-server");
    let db_version = get_crate_version("../didhub-db");
    let auth_version = get_crate_version("../didhub-auth");
    let cache_version = get_crate_version("../didhub-cache");
    let error_version = get_crate_version("../didhub-error");
    let config_version = get_crate_version("../didhub-config");
    let oidc_version = get_crate_version("../didhub-oidc");
    let metrics_version = get_crate_version("../didhub-metrics");
    let housekeeping_version = get_crate_version("../didhub-housekeeping");
    let middleware_version = get_crate_version("../didhub-middleware");
    let updater_version = get_crate_version("../didhub-updater");
    let migrations_version = get_crate_version("../didhub-migrations");
    let frontend_version = get_frontend_version();
    // Attempt to read current git commit short hash and build time
    fn get_git_commit() -> String {
        if let Ok(output) = std::process::Command::new("git").args(["rev-parse", "--short", "HEAD"]).output() {
            if output.status.success() {
                if let Ok(s) = String::from_utf8(output.stdout) {
                    return s.trim().to_string();
                }
            }
        }
        "unknown".to_string()
    }

    fn get_build_time() -> String {
        // Use RFC3339 UTC now
        chrono::Utc::now().to_rfc3339()
    }

    let git_commit = get_git_commit();
    let build_time = get_build_time();
    // Capture Rust target triple if provided during cross-compilation
    let target_triple = std::env::var("TARGET").unwrap_or_else(|_| "unknown".to_string());

    let out_dir = std::env::var("OUT_DIR").unwrap();
    let dest_path = Path::new(&out_dir).join("versions.rs");
    let versions_code = format!(
        r#"pub const SERVER_VERSION: &str = "{}";
pub const DB_VERSION: &str = "{}";
pub const AUTH_VERSION: &str = "{}";
pub const CACHE_VERSION: &str = "{}";
pub const ERROR_VERSION: &str = "{}";
pub const CONFIG_VERSION: &str = "{}";
pub const OIDC_VERSION: &str = "{}";
pub const METRICS_VERSION: &str = "{}";
pub const HOUSEKEEPING_VERSION: &str = "{}";
pub const MIDDLEWARE_VERSION: &str = "{}";
pub const UPDATER_VERSION: &str = "{}";
pub const MIGRATIONS_VERSION: &str = "{}";
pub const FRONTEND_VERSION: &str = "{}";
pub const GIT_COMMIT: &str = "{}";
pub const BUILD_TIME: &str = "{}";
pub const TARGET_TRIPLE: &str = "{}";
"#,
        server_version,
        db_version,
        auth_version,
        cache_version,
        error_version,
        config_version,
        oidc_version,
        metrics_version,
        housekeeping_version,
        middleware_version,
        updater_version,
        migrations_version,
        frontend_version,
        git_commit,
        build_time,
        target_triple
    );

    fs::write(&dest_path, versions_code).unwrap();

    // Tell cargo to rerun if any Cargo.toml or package.json changes
    println!("cargo:rerun-if-changed=../didhub-server/Cargo.toml");
    println!("cargo:rerun-if-changed=../didhub-db/Cargo.toml");
    println!("cargo:rerun-if-changed=../didhub-auth/Cargo.toml");
    println!("cargo:rerun-if-changed=../didhub-cache/Cargo.toml");
    println!("cargo:rerun-if-changed=../didhub-error/Cargo.toml");
    println!("cargo:rerun-if-changed=../didhub-config/Cargo.toml");
    println!("cargo:rerun-if-changed=../didhub-oidc/Cargo.toml");
    println!("cargo:rerun-if-changed=../didhub-metrics/Cargo.toml");
    println!("cargo:rerun-if-changed=../didhub-housekeeping/Cargo.toml");
    println!("cargo:rerun-if-changed=../didhub-middleware/Cargo.toml");
    println!("cargo:rerun-if-changed=../didhub-updater/Cargo.toml");
    println!("cargo:rerun-if-changed=../didhub-migrations/Cargo.toml");
    println!("cargo:rerun-if-changed=../../packages/frontend/package.json");
}
