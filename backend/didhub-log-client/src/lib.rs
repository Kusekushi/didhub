//! Logging utility for DIDHub.
//!
//! This crate provides structured logging categories and utilities that wrap the `tracing` ecosystem.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::str::FromStr;
use tracing::Level;

/// Categories supported by the logger.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum LogCategory {
    Audit,
    Job,
}

impl LogCategory {
    /// Returns the string label for this category.
    #[inline]
    #[must_use]
    pub const fn as_label(self) -> &'static str {
        match self {
            Self::Audit => "audit",
            Self::Job => "job",
        }
    }

    /// Logs a message to this category using `tracing`.
    pub fn log(&self, level: Level, message: &str, metadata: Option<Value>) {
        match (self, level) {
            (Self::Audit, Level::TRACE) => {
                if let Some(meta) = metadata {
                    tracing::trace!(category = "audit", %message, metadata = %meta);
                } else {
                    tracing::trace!(category = "audit", %message);
                }
            }
            (Self::Audit, Level::DEBUG) => {
                if let Some(meta) = metadata {
                    tracing::debug!(category = "audit", %message, metadata = %meta);
                } else {
                    tracing::debug!(category = "audit", %message);
                }
            }
            (Self::Audit, Level::INFO) => {
                if let Some(meta) = metadata {
                    tracing::info!(category = "audit", %message, metadata = %meta);
                } else {
                    tracing::info!(category = "audit", %message);
                }
            }
            (Self::Audit, Level::WARN) => {
                if let Some(meta) = metadata {
                    tracing::warn!(category = "audit", %message, metadata = %meta);
                } else {
                    tracing::warn!(category = "audit", %message);
                }
            }
            (Self::Audit, Level::ERROR) => {
                if let Some(meta) = metadata {
                    tracing::error!(category = "audit", %message, metadata = %meta);
                } else {
                    tracing::error!(category = "audit", %message);
                }
            }
            (Self::Job, Level::TRACE) => {
                if let Some(meta) = metadata {
                    tracing::trace!(category = "job", %message, metadata = %meta);
                } else {
                    tracing::trace!(category = "job", %message);
                }
            }
            (Self::Job, Level::DEBUG) => {
                if let Some(meta) = metadata {
                    tracing::debug!(category = "job", %message, metadata = %meta);
                } else {
                    tracing::debug!(category = "job", %message);
                }
            }
            (Self::Job, Level::INFO) => {
                if let Some(meta) = metadata {
                    tracing::info!(category = "job", %message, metadata = %meta);
                } else {
                    tracing::info!(category = "job", %message);
                }
            }
            (Self::Job, Level::WARN) => {
                if let Some(meta) = metadata {
                    tracing::warn!(category = "job", %message, metadata = %meta);
                } else {
                    tracing::warn!(category = "job", %message);
                }
            }
            (Self::Job, Level::ERROR) => {
                if let Some(meta) = metadata {
                    tracing::error!(category = "job", %message, metadata = %meta);
                } else {
                    tracing::error!(category = "job", %message);
                }
            }
        }
    }
}

impl FromStr for LogCategory {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        if s.eq_ignore_ascii_case("audit") {
            Ok(Self::Audit)
        } else if s.eq_ignore_ascii_case("job") {
            Ok(Self::Job)
        } else {
            Err(format!("unknown log category `{s}`"))
        }
    }
}

impl std::fmt::Display for LogCategory {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_label())
    }
}
