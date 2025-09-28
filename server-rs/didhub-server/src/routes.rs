//! # Common API Routes
//!
//! This module contains shared route handlers and utilities used across the API.

use axum::Extension;
use axum::Json;
use didhub_db::Db;
use serde::Serialize;
use sqlx;

/// Response structure for health check endpoint
#[derive(Serialize)]
pub struct HealthResponse {
    /// Overall service status ("ok" or "error")
    pub status: &'static str,
    /// Database connectivity status ("ok" or "error")
    pub database: &'static str,
    /// Current server version
    pub version: &'static str,
}

/// Health check endpoint that verifies database connectivity.
///
/// Returns a JSON response with the service status, database status, and version.
/// This endpoint is public and does not require authentication.
///
/// # Returns
///
/// A JSON response containing:
/// - `status`: Always "ok" if the endpoint is reachable
/// - `database`: "ok" if database query succeeds, "error" otherwise
/// - `version`: The current package version
pub async fn health(Extension(db): Extension<Db>) -> Json<HealthResponse> {
    // Check database connectivity with a simple query
    let db_status = match sqlx::query("SELECT 1").execute(&db.pool).await {
        Ok(_) => "ok",
        Err(_) => "error",
    };

    Json(HealthResponse {
        status: "ok",
        database: db_status,
        version: env!("CARGO_PKG_VERSION"),
    })
}
