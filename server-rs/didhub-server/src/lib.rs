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
