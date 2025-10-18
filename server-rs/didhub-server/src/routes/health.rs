//! # Common API Routes
//!
//! This module contains shared route handlers and utilities used across the API.

use axum::Extension;
use didhub_db::Db;

/// Health check endpoint that verifies database connectivity.
///
/// Returns "OK" if the service is healthy.
/// This endpoint is public and does not require authentication.
///
/// # Returns
///
/// A plain text response containing "OK"
pub async fn health(Extension(db): Extension<Db>) -> &'static str {
    // Check database connectivity with a simple query
    match sqlx::query("SELECT 1").execute(&db.pool).await {
        Ok(_) => "OK",
        Err(_) => "ERROR",
    }
}
