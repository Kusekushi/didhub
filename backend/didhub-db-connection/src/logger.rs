use didhub_log_client::LogCategory;
use serde_json::json;

use crate::config::DbConnectionConfig;
use crate::error::DbConnectionError;
use crate::utils::config_metadata;

/// Helper for emitting audit events about database connection lifecycle into the application log.
#[derive(Debug, Clone)]
pub struct ConnectionLogger {
    source: String,
}

impl ConnectionLogger {
    /// Build a new logger with an explicit source label (e.g. service name).
    pub fn new(source: impl Into<String>) -> Self {
        Self {
            source: source.into(),
        }
    }

    /// Record a connection attempt audit event.
    pub fn log_attempt(&self, config: &DbConnectionConfig) {
        self.append_event("db_pool.create_attempt", config_metadata(config))
    }

    /// Record a successful connection audit event.
    pub fn log_success(&self, config: &DbConnectionConfig) {
        self.append_event("db_pool.create_success", config_metadata(config))
    }

    /// Record a failed connection audit event including error details.
    pub fn log_failure(&self, config: &DbConnectionConfig, error: &DbConnectionError) {
        let metadata = config_metadata(config);
        let enriched = json!({
            "config": metadata,
            "error": error.to_string(),
        });
        self.append_event("db_pool.create_failure", enriched)
    }

    fn append_event(&self, message: &str, metadata: serde_json::Value) {
        let mut enriched_metadata = metadata;
        if !self.source.is_empty() {
            if let Some(obj) = enriched_metadata.as_object_mut() {
                obj.insert("source".to_string(), json!(self.source));
            }
        }
        LogCategory::Audit.log(tracing::Level::INFO, message, Some(enriched_metadata));
    }
}
