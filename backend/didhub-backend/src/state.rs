use std::collections::HashMap;
use std::sync::Arc;

use didhub_auth::AuthenticatorTrait;
use didhub_job_queue::JobQueueClient;
use didhub_log_client::{AppendRequest, LogCategory, LogToolClient};
use didhub_updates::UpdateCoordinator;
use serde_json::{json, Value};
use std::sync::RwLock;

use crate::error::ApiError;

/// Shared application state passed to every route handler.
pub struct AppState {
    pub db_pool: Arc<didhub_db::DbPool>,
    // Use an Arc-wrapped RwLock to allow swapping the inner Arc<T> atomically.
    log_client: Arc<RwLock<Arc<LogToolClient>>>,
    authenticator: Arc<RwLock<Arc<dyn AuthenticatorTrait>>>,
    pub job_queue: JobQueueClient,
    pub updates: UpdateCoordinator,
}

impl Clone for AppState {
    fn clone(&self) -> Self {
        Self {
            db_pool: Arc::clone(&self.db_pool),
            log_client: Arc::clone(&self.log_client),
            authenticator: Arc::clone(&self.authenticator),
            job_queue: self.job_queue.clone(),
            updates: self.updates.clone(),
        }
    }
}

impl AppState {
    /// Build a fully initialised state container from its constituent parts.
    pub fn new(
        db_pool: didhub_db::DbPool,
        log_client: LogToolClient,
        authenticator: Arc<dyn AuthenticatorTrait>,
        job_queue: JobQueueClient,
        updates: UpdateCoordinator,
    ) -> Self {
        Self {
            db_pool: Arc::new(db_pool),
            log_client: Arc::new(RwLock::new(Arc::new(log_client))),
            authenticator: Arc::new(RwLock::new(authenticator)),
            job_queue,
            updates,
        }
    }

    /// Atomically get a clone of the current log client.
    pub fn log_client(&self) -> Arc<LogToolClient> {
        let guard = self.log_client.read().unwrap();
        guard.clone()
    }

    /// Atomically replace the log client with a new instance and return the old one.
    pub fn swap_log_client(&self, new: LogToolClient) -> Arc<LogToolClient> {
        let mut guard = self.log_client.write().unwrap();
        let old = guard.clone();
        *guard = Arc::new(new);
        old
    }

    /// Atomically get a clone of the current authenticator.
    pub fn authenticator(&self) -> Arc<dyn AuthenticatorTrait> {
        let guard = self.authenticator.read().unwrap();
        guard.clone()
    }

    /// Atomically swap the authenticator, returning the previous one.
    pub fn swap_authenticator(
        &self,
        new: Arc<dyn AuthenticatorTrait>,
    ) -> Arc<dyn AuthenticatorTrait> {
        let mut guard = self.authenticator.write().unwrap();
        let old = guard.clone();
        *guard = new;
        old
    }

    /// Record a request/response lifecycle entry via the shared log client.
    pub async fn audit_request(
        &self,
        method: &str,
        path: &str,
        path_params: &HashMap<String, String>,
        query_params: &HashMap<String, String>,
        body: &Value,
    ) -> Result<(), ApiError> {
        let mut request = AppendRequest::new(LogCategory::Audit, format!("{method} {path}"));

        let metadata = json!({
            "path": path,
            "path_params": path_params,
            "query": query_params,
            "body": body,
        });

        request = request.with_metadata(metadata);
        // Don't fail requests if logging fails. Swallow log client errors and proceed.
        let _ = self.log_client().append(request);
        Ok(())
    }
}
