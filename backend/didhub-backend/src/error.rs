use axum::{http::StatusCode, response::IntoResponse, Json};
use serde_json::json;
use thiserror::Error;

type DbConnectionError = didhub_db_connection::DbConnectionError;
type SqlxError = sqlx::Error;
type SerdeJsonError = serde_json::Error;

/// Top-level API error shared by all route handlers.
#[derive(Debug, Error)]
pub enum ApiError {
    #[error("database error: {0}")]
    Database(#[from] DbConnectionError),
    #[error("authentication error: {0}")]
    Authentication(#[from] didhub_auth::auth::AuthError),
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
    #[error("internal error: {0}")]
    Internal(String),
    #[error("unexpected error: {0}")]
    Unexpected(String),
    #[error("sqlx error: {0}")]
    Sqlx(#[from] SqlxError),
    #[error("serde error: {0}")]
    Serde(#[from] SerdeJsonError),
}

impl ApiError {
    pub fn bad_request(msg: impl Into<String>) -> Self {
        Self::BadRequest(msg.into())
    }

    pub fn not_found(msg: impl Into<String>) -> Self {
        Self::NotFound(msg.into())
    }

    pub fn not_implemented(operation: &'static str) -> Self {
        Self::NotImplemented { operation }
    }

    pub fn forbidden(msg: impl Into<String>) -> Self {
        Self::Forbidden(msg.into())
    }

    pub fn internal(msg: impl Into<String>) -> Self {
        Self::Internal(msg.into())
    }

    pub fn internal_error(msg: impl Into<String>) -> Self {
        Self::Internal(msg.into())
    }

    pub fn unexpected(msg: impl Into<String>) -> Self {
        Self::Unexpected(msg.into())
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> axum::response::Response {
        let (status, message) = match self {
            ApiError::Database(_) => (StatusCode::SERVICE_UNAVAILABLE, self.to_string()),
            ApiError::Authentication(_) => (StatusCode::UNAUTHORIZED, self.to_string()),
            ApiError::JobQueue(_) => (StatusCode::INTERNAL_SERVER_ERROR, self.to_string()),
            ApiError::Update(_) => (StatusCode::INTERNAL_SERVER_ERROR, self.to_string()),
            ApiError::NotImplemented { .. } => (StatusCode::NOT_IMPLEMENTED, self.to_string()),
            ApiError::NotFound(_) => (StatusCode::NOT_FOUND, self.to_string()),
            ApiError::BadRequest(_) => (StatusCode::BAD_REQUEST, self.to_string()),
            ApiError::Forbidden(_) => (StatusCode::FORBIDDEN, self.to_string()),
            ApiError::Validation(_) => (StatusCode::UNPROCESSABLE_ENTITY, self.to_string()),
            ApiError::Internal(_) => (StatusCode::INTERNAL_SERVER_ERROR, self.to_string()),
            ApiError::Unexpected(_) => (StatusCode::INTERNAL_SERVER_ERROR, self.to_string()),
            ApiError::Sqlx(_) => (StatusCode::INTERNAL_SERVER_ERROR, self.to_string()),
            ApiError::Serde(_) => (StatusCode::BAD_REQUEST, self.to_string()),
        };

        let body = Json(json!({
            "error": message,
        }));

        (status, body).into_response()
    }
}
