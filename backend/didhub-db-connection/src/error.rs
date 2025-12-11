use std::num::ParseIntError;

use didhub_log_client::LogClientError;
use thiserror::Error;

/// Non-recursive error kinds for efficient composition
#[derive(Debug)]
pub enum DbConnectionErrorKind {
    MissingEnvVar(String),
    EmptyDatabaseUrl,
    InvalidUnicode(String),
    InvalidNumber { var: String, source: ParseIntError },
    InvalidBoolean { var: String, value: String },
    FileCreation(String),
    Sqlx(sqlx::Error),
}

impl std::fmt::Display for DbConnectionErrorKind {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::MissingEnvVar(var) => write!(f, "environment variable {var} is missing"),
            Self::EmptyDatabaseUrl => write!(f, "database url cannot be empty"),
            Self::InvalidUnicode(var) => {
                write!(f, "environment variable {var} contains invalid unicode")
            }
            Self::InvalidNumber { var, source } => write!(
                f,
                "failed to parse numeric environment variable {var}: {source}"
            ),
            Self::InvalidBoolean { var, value } => {
                write!(f, "invalid boolean value '{value}' for {var}")
            }
            Self::FileCreation(msg) => write!(f, "file/directory creation error: {msg}"),
            Self::Sqlx(err) => write!(f, "{err}"),
        }
    }
}

impl std::error::Error for DbConnectionErrorKind {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::InvalidNumber { source, .. } => Some(source),
            Self::Sqlx(err) => err.source(),
            _ => None,
        }
    }
}

impl From<DbConnectionError> for DbConnectionErrorKind {
    fn from(error: DbConnectionError) -> Self {
        match error {
            DbConnectionError::MissingEnvVar(var) => Self::MissingEnvVar(var),
            DbConnectionError::EmptyDatabaseUrl => Self::EmptyDatabaseUrl,
            DbConnectionError::InvalidUnicode(var) => Self::InvalidUnicode(var),
            DbConnectionError::InvalidNumber { var, source } => Self::InvalidNumber { var, source },
            DbConnectionError::InvalidBoolean { var, value } => Self::InvalidBoolean { var, value },
            DbConnectionError::FileCreation(msg) => Self::FileCreation(msg),
            DbConnectionError::Sqlx(err) => Self::Sqlx(err),
            // For log client errors, we can't convert them properly, so we use a generic message
            DbConnectionError::LogClient(_) => Self::FileCreation("Log client error".to_owned()),
            DbConnectionError::LogClientDuringDbError { original, .. } => original,
        }
    }
}

/// Errors that can occur while configuring or creating the database pool.
#[derive(Debug, Error)]
pub enum DbConnectionError {
    #[error("environment variable {0} is missing")]
    MissingEnvVar(String),
    #[error("database url cannot be empty")]
    EmptyDatabaseUrl,
    #[error("environment variable {0} contains invalid unicode")]
    InvalidUnicode(String),
    #[error("failed to parse numeric environment variable {var}: {source}")]
    InvalidNumber {
        var: String,
        #[source]
        source: ParseIntError,
    },
    #[error("invalid boolean value '{value}' for {var}")]
    InvalidBoolean { var: String, value: String },
    #[error("log collector error: {0}")]
    LogClient(#[from] LogClientError),
    #[error("log collector error while handling database failure: {log_error}")]
    LogClientDuringDbError {
        original: DbConnectionErrorKind,
        log_error: LogClientError,
    },
    #[error("file/directory creation error: {0}")]
    FileCreation(String),
    #[error(transparent)]
    Sqlx(#[from] sqlx::Error),
}
