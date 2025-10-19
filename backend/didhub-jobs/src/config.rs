//! Configuration reload job implementation.

use didhub_job_queue::{async_trait, JobExecutor, JobQueueError};
use serde_json::Value;
use tracing::info;

use crate::job_types;

/// Executor for config.reload jobs.
///
/// Handles configuration reload events. This job is primarily used for
/// logging and auditing configuration changes. The actual reload is
/// typically performed by the config watcher before this job runs.
#[derive(Debug, Default)]
pub struct ConfigReloadExecutor {
    // In a real implementation, this might hold:
    // - Notification service for alerting admins
    // - Audit log writer
}

impl ConfigReloadExecutor {
    pub fn new() -> Self {
        Self::default()
    }
}

#[async_trait]
impl JobExecutor for ConfigReloadExecutor {
    fn job_type(&self) -> &str {
        job_types::CONFIG_RELOAD
    }

    async fn execute(&self, payload: Value) -> Result<(), JobQueueError> {
        // The payload typically contains "old" and "new" configuration
        // for auditing purposes
        let old_config = payload.get("old");
        let new_config = payload.get("new");

        info!(
            has_old = old_config.is_some(),
            has_new = new_config.is_some(),
            "processing config.reload event"
        );

        // Log what changed (without exposing sensitive values)
        if let (Some(old), Some(new)) = (old_config, new_config) {
            let changes = diff_config_keys(old, new);
            if !changes.is_empty() {
                info!(
                    changed_sections = ?changes,
                    "configuration sections modified"
                );
            }
        }

        info!("config.reload job completed");
        Ok(())
    }
}

/// Extract top-level keys that differ between old and new config.
fn diff_config_keys(old: &Value, new: &Value) -> Vec<String> {
    let mut changes = Vec::new();

    if let (Some(old_obj), Some(new_obj)) = (old.as_object(), new.as_object()) {
        // Check for modified or added keys
        for key in new_obj.keys() {
            let old_val = old_obj.get(key);
            let new_val = new_obj.get(key);
            if old_val != new_val {
                changes.push(key.clone());
            }
        }

        // Check for removed keys
        for key in old_obj.keys() {
            if !new_obj.contains_key(key) {
                changes.push(format!("-{}", key));
            }
        }
    }

    changes.sort();
    changes
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[tokio::test]
    async fn test_config_reload_executor() {
        let executor = ConfigReloadExecutor::new();
        assert_eq!(executor.job_type(), "config.reload");

        let payload = json!({
            "old": {
                "server": { "port": 8080 },
                "database": { "url": "postgres://localhost/old" }
            },
            "new": {
                "server": { "port": 8081 },
                "database": { "url": "postgres://localhost/old" }
            }
        });

        let result = executor.execute(payload).await;
        assert!(result.is_ok());
    }

    #[test]
    fn test_diff_config_keys() {
        let old = json!({
            "server": { "port": 8080 },
            "database": { "url": "old" },
            "removed": true
        });

        let new = json!({
            "server": { "port": 8081 },
            "database": { "url": "old" },
            "added": true
        });

        let changes = diff_config_keys(&old, &new);
        assert!(changes.contains(&"-removed".to_string()));
        assert!(changes.contains(&"added".to_string()));
        assert!(changes.contains(&"server".to_string()));
    }
}
