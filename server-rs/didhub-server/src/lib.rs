//! # DIDHub Server
//!
//! A Rust-based backend server for DIDHub, providing REST API endpoints for managing
//! alters, systems, users, and related functionality in DID communities.
//!
//! ## Architecture
//!
//! The server is built using:
//! - **Axum**: Web framework for HTTP routing and middleware
//! - **SQLx**: Async database toolkit with compile-time query checking
//! - **Tokio**: Async runtime
//! - **Tracing**: Structured logging
//!
//! ## Features
//!
//! - User authentication with JWT tokens
//! - Multi-system and alter management
//! - File uploads and avatar management
//! - Admin panel with audit logging
//! - OIDC integration
//! - Auto-updates (optional)
//! - Static file serving with optional embedding
//!
//! ## Database Support
//!
//! Supports SQLite, PostgreSQL, and MySQL through SQLx.
//!
//! ## API Version
//!
//! Current API version: 1.0

pub mod logging;
pub mod rate_limit_governor;
pub mod routes;
pub mod routes_admin_misc;
pub mod routes_alters;
pub mod routes_audit;
pub mod routes_avatar;
pub mod routes_common;
pub mod routes_debug;
pub mod routes_groups;
pub mod routes_housekeeping;
pub mod routes_oidc;
pub mod routes_password_reset;
pub mod routes_pdf;
pub mod routes_posts;
pub mod routes_settings;
pub mod routes_shortlinks;
pub mod routes_static;
pub mod routes_subsystems;
pub mod routes_system_requests;
pub mod routes_systems;
pub mod routes_upload;
pub mod routes_upload_admin;
pub mod routes_user_alter_relationships;
pub mod routes_users;
pub mod security_headers;
pub mod settings;
pub mod upload_dir;
pub mod version;

pub mod constants;
pub mod router;
pub mod services;

use axum::Router;
pub use didhub_auth as auth;
pub use didhub_config as config;
pub use didhub_db as db;
pub use didhub_middleware as middleware;
pub use didhub_oidc as oidc;

use router::AppRouterBuilder;

/// Build the main application router with all routes and middleware.
///
/// This function constructs the Axum router with:
/// - Authentication middleware
/// - Rate limiting
/// - CORS configuration
/// - All API route handlers
/// - Static file serving
///
/// # Arguments
///
/// * `db` - Database connection pool
/// * `cfg` - Application configuration
///
/// # Returns
///
/// A configured Axum `Router` ready to serve requests
pub async fn build_router(db: db::Db, cfg: config::AppConfig) -> Router {
    AppRouterBuilder::new(db, cfg).build().await
}
