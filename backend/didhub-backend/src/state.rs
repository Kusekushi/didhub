use std::collections::HashMap;
use std::sync::Arc;

use didhub_auth::auth::AuthenticatorTrait;
use didhub_job_queue::JobQueueClient;
use didhub_log_client::LogCategory;
use didhub_updates::UpdateCoordinator;
use serde_json::{json, Value};
use std::sync::RwLock;

use crate::error::ApiError;

const SENSITIVE_FIELDS: &[&str] = &[
    "password",
    "passwordHash",
    "password_hash",
    "currentPasswordHash",
    "current_password_hash",
    "newPasswordHash",
    "new_password_hash",
    "newPassword",
    "new_password",
    "token",
    "secret",
    "apiKey",
    "api_key",
    "content",
    "data",
];

fn redact_sensitive_data(mut value: Value) -> Value {
    if let Some(obj) = value.as_object_mut() {
        for key in SENSITIVE_FIELDS {
            if let Some(v) = obj.remove(*key) {
                obj.insert((*key).to_string(), json!("[REDACTED]"));
                let _ = v;
            }
        }
        for (_, v) in obj.iter_mut() {
            *v = redact_sensitive_data(v.clone());
        }
    } else if let Some(arr) = value.as_array_mut() {
        for item in arr.iter_mut() {
            *item = redact_sensitive_data(std::mem::take(item));
        }
    }
    value
}

pub struct AppState {
    pub db_pool: Arc<didhub_db::DbPool>,
    authenticator: Arc<RwLock<Arc<dyn AuthenticatorTrait>>>,
    pub job_queue: JobQueueClient,
    pub updates: UpdateCoordinator,
    pub reload_handle: Option<crate::tracing_setup::ReloadHandle>,
}

impl Clone for AppState {
    fn clone(&self) -> Self {
        Self {
            db_pool: Arc::clone(&self.db_pool),
            authenticator: Arc::clone(&self.authenticator),
            job_queue: self.job_queue.clone(),
            updates: self.updates.clone(),
            reload_handle: self.reload_handle.clone(),
        }
    }
}

impl AppState {
    /// Build a fully initialised state container from its constituent parts.
    pub fn new(
        db_pool: didhub_db::DbPool,
        authenticator: Arc<dyn AuthenticatorTrait>,
        job_queue: JobQueueClient,
        updates: UpdateCoordinator,
        reload_handle: Option<crate::tracing_setup::ReloadHandle>,
    ) -> Self {
        Self {
            db_pool: Arc::new(db_pool),
            authenticator: Arc::new(RwLock::new(authenticator)),
            job_queue,
            updates,
            reload_handle,
        }
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

    pub async fn audit_request(
        &self,
        method: &str,
        path: &str,
        path_params: &HashMap<String, String>,
        query_params: &HashMap<String, String>,
        body: &Value,
    ) -> Result<(), ApiError> {
        let message = format!("{} {}", method, path);

        let safe_body = redact_sensitive_data(body.clone());
        let safe_path_params = redact_sensitive_data(serde_json::to_value(path_params).unwrap_or_default());
        let safe_query_params = redact_sensitive_data(serde_json::to_value(query_params).unwrap_or_default());

        let metadata = json!({
            "path": path,
            "path_params": safe_path_params,
            "query": safe_query_params,
            "body": safe_body,
        });

        LogCategory::Audit.log(tracing::Level::INFO, &message, Some(metadata));

        Ok(())
    }
}
