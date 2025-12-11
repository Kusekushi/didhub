use didhub_log_client::{
    AppendRequest, ExportOptions, LogCategory as ConnectionLogCategory, LogClientError,
    LogEntry as ConnectionLogEntry, LogToolClient,
};
use serde_json::json;

use crate::config::DbConnectionConfig;
use crate::error::DbConnectionError;
use crate::utils::config_metadata;

/// Helper for emitting audit events about database connection lifecycle into the shared log collector.
#[derive(Debug, Clone)]
pub struct ConnectionLogger {
    client: LogToolClient,
    source: String,
}

impl ConnectionLogger {
    /// Build a new logger with an explicit source label (e.g. service name).
    pub fn new(client: LogToolClient, source: impl Into<String>) -> Self {
        Self {
            client,
            source: source.into(),
        }
    }

    /// Access the underlying log tool client.
    pub fn client(&self) -> &LogToolClient {
        &self.client
    }

    /// Record a connection attempt audit event.
    pub fn log_attempt(&self, config: &DbConnectionConfig) -> Result<(), LogClientError> {
        self.append_event("db_pool.create_attempt", config_metadata(config))
    }

    /// Record a successful connection audit event.
    pub fn log_success(&self, config: &DbConnectionConfig) -> Result<(), LogClientError> {
        self.append_event("db_pool.create_success", config_metadata(config))
    }

    /// Record a failed connection audit event including error details.
    pub fn log_failure(
        &self,
        config: &DbConnectionConfig,
        error: &DbConnectionError,
    ) -> Result<(), LogClientError> {
        let metadata = config_metadata(config);
        let enriched = json!({
            "config": metadata,
            "error": error.to_string(),
        });
        self.append_event("db_pool.create_failure", enriched)
    }

    /// Return recent audit entries for the connection component, optionally draining them.
    pub fn export_audit_logs(
        &self,
        limit: Option<usize>,
        drain: bool,
    ) -> Result<Vec<ConnectionLogEntry>, LogClientError> {
        let mut options = ExportOptions::default().with_category(ConnectionLogCategory::Audit);
        if let Some(limit) = limit {
            options = options.with_limit(limit);
        }
        if drain {
            options = options.draining(true);
        }
        self.client.export(options)
    }

    fn append_event(
        &self,
        message: &str,
        metadata: serde_json::Value,
    ) -> Result<(), LogClientError> {
        let mut request = AppendRequest::new(ConnectionLogCategory::Audit, message.to_owned());
        if !self.source.is_empty() {
            request = request.with_source(self.source.clone());
        }
        request = request.with_metadata(metadata);
        self.client.append(request).map(|_| ())
    }
}