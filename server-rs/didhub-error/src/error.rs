use axum::{
    http::{HeaderValue, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use serde::Serialize;
use thiserror::Error;
use tracing::{error, info, warn};

// Canonical error codes (string) to align with existing TS server patterns.
// We keep original display text for backwards-compatible `error` value.

#[derive(Debug, Error)]
pub enum AppError {
    #[error("not found")]
    NotFound,
    #[error("auth required")]
    Unauthorized,
    #[error("forbidden")]
    Forbidden,
    #[error("must change password")]
    MustChangePassword,
    #[error("not approved")]
    NotApproved,
    #[error("bad request: {0}")]
    BadRequest(String),
    #[error("internal error")]
    Internal,
    #[error("validation failed")]
    Validation(Vec<String>),
}

#[derive(Serialize)]
pub struct ErrorBody {
    pub error: String,        // human-ish message (existing clients use this)
    pub code: Option<String>, // stable machine code (new)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<Vec<String>>, // validation or extra info
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, code, details) = match &self {
            AppError::NotFound => {
                info!(error_code="not_found", status_code=%StatusCode::NOT_FOUND, "resource not found");
                (StatusCode::NOT_FOUND, "not_found", None)
            }
            AppError::Unauthorized => {
                warn!(error_code="auth_required", status_code=%StatusCode::UNAUTHORIZED, "authentication required");
                (StatusCode::UNAUTHORIZED, "auth_required", None)
            }
            AppError::Forbidden => {
                warn!(error_code="forbidden", status_code=%StatusCode::FORBIDDEN, "access forbidden");
                (StatusCode::FORBIDDEN, "forbidden", None)
            }
            AppError::MustChangePassword => {
                info!(error_code="must_change_password", status_code=%StatusCode::PRECONDITION_REQUIRED, "password change required");
                (
                    StatusCode::PRECONDITION_REQUIRED,
                    "must_change_password",
                    None,
                )
            }
            AppError::NotApproved => {
                warn!(error_code="not_approved", status_code=%StatusCode::FORBIDDEN, "user account not approved");
                (StatusCode::FORBIDDEN, "not_approved", None)
            }
            AppError::BadRequest(msg) => {
                warn!(error_code="bad_request", status_code=%StatusCode::BAD_REQUEST, message=%msg, "bad request error");
                (StatusCode::BAD_REQUEST, "bad_request", None)
            }
            AppError::Internal => {
                error!(error_code="internal_error", status_code=%StatusCode::INTERNAL_SERVER_ERROR, "internal server error");
                (StatusCode::INTERNAL_SERVER_ERROR, "internal_error", None)
            }
            AppError::Validation(errors) => {
                warn!(error_code="validation_failed", status_code=%StatusCode::BAD_REQUEST, error_count=%errors.len(), "validation failed");
                (
                    StatusCode::BAD_REQUEST,
                    "validation_failed",
                    Some(errors.clone()),
                )
            }
        };
        let base_msg = match &self {
            AppError::BadRequest(msg) => format!("bad request: {msg}"),
            AppError::Validation(_) => "validation failed".to_string(),
            other => other.to_string(),
        };
        let body = Json(ErrorBody {
            error: base_msg,
            code: Some(code.to_string()),
            details,
        });
        let mut response = (status, body).into_response();
        if let Ok(hv) = HeaderValue::from_str(code) {
            response.headers_mut().insert("x-error-code", hv);
        }
        response
    }
}

impl From<anyhow::Error> for AppError {
    fn from(err: anyhow::Error) -> Self {
        error!(source_error=%err, "converting anyhow error to AppError");
        AppError::Internal
    }
}

impl AppError {
    pub fn validation<I, S>(items: I) -> Self
    where
        I: IntoIterator<Item = S>,
        S: Into<String>,
    {
        AppError::Validation(items.into_iter().map(|s| s.into()).collect())
    }
}
