use axum::{http::StatusCode, response::IntoResponse, Json};
use serde_json::json;
use thiserror::Error;

type LogClientError = didhub_log_client::LogClientError;

type DbConnectionError = didhub_db_connection::DbConnectionError;
type SqlxError = sqlx::Error;
type SerdeJsonError = serde_json::Error;

/// Top-level API error shared by all route handlers.
#[derive(Debug, Error)]
pub enum ApiError {
    #[error("database error: {0}")]
    Database(#[from] DbConnectionError),
    #[error("log client error: {0}")]
    LogClient(#[from] LogClientError),
    #[error("authentication error: {0}")]
    Authentication(#[from] didhub_auth::AuthError),
    #[error("job queue error: {0}")]
    JobQueue(#[from] didhub_job_queue::JobQueueError),
    #[error("update subsystem error: {0}")]
    Update(#[from] didhub_updates::UpdateError),
    #[error("operation {operation} is not implemented")]
    NotImplemented { operation: &'static str },
    #[error("not found: {0}")]
    NotFound(String),
    #[error("bad request: {0}")]
    BadRequest(String),
    #[error("forbidden: {0}")]
    Forbidden(String),
    #[error("validation error")]
    Validation(serde_json::Value),
    #[error(transparent)]
    Sqlx(#[from] SqlxError),
    #[error(transparent)]
    SerdeJson(#[from] SerdeJsonError),
    #[error("unexpected error: {0}")]
    Unexpected(String),
}

impl IntoResponse for ApiError {
    fn into_response(self) -> axum::response::Response {
        let status = match self {
            ApiError::Database(_) => StatusCode::INTERNAL_SERVER_ERROR,
            ApiError::LogClient(_) => StatusCode::BAD_GATEWAY,
            ApiError::Authentication(_) => StatusCode::UNAUTHORIZED,
            ApiError::JobQueue(_) => StatusCode::SERVICE_UNAVAILABLE,
            ApiError::Update(_) => StatusCode::SERVICE_UNAVAILABLE,
            ApiError::NotImplemented { .. } => StatusCode::NOT_IMPLEMENTED,
            ApiError::NotFound { .. } => StatusCode::NOT_FOUND,
            ApiError::BadRequest { .. } => StatusCode::BAD_REQUEST,
            ApiError::Forbidden(_) => StatusCode::FORBIDDEN,
            ApiError::Validation(_) => StatusCode::BAD_REQUEST,
            ApiError::Sqlx(_) => StatusCode::INTERNAL_SERVER_ERROR,
            ApiError::SerdeJson(_) => StatusCode::BAD_REQUEST,
            ApiError::Unexpected(_) => StatusCode::INTERNAL_SERVER_ERROR,
        };

        let payload = match self {
            ApiError::Validation(v) => v.clone(),
            _ => json!({ "error": self.to_string() }),
        };

        (status, Json(payload)).into_response()
    }
}

impl ApiError {
    /// Helper for generated handlers to surface unimplemented operations.
    pub fn not_implemented(operation: &'static str) -> Self {
        Self::NotImplemented { operation }
    }

    pub fn not_found(message: impl Into<String>) -> Self {
        Self::NotFound(message.into())
    }

    pub fn bad_request(message: impl Into<String>) -> Self {
        Self::BadRequest(message.into())
    }

    pub fn forbidden(message: impl Into<String>) -> Self {
        Self::Forbidden(message.into())
    }
}
