use super::*;
use chrono::{Duration, Utc};
use didhub_db::alters::AlterOperations;
use didhub_db::audit;
use didhub_db::common::CommonOperations;
use didhub_db::posts::PostOperations;
use didhub_db::settings::SettingOperations;
use didhub_db::systems::{SystemListFilters, SystemOperations};
use didhub_db::uploads::UploadOperations;
use didhub_db::users::UserOperations;
use serde_json::json;

/// Job for cleaning up old audit records
pub struct AuditRetentionJob;

#[async_trait]
impl Job for AuditRetentionJob {
    fn name(&self) -> &'static str {
        "audit_retention"
    }

    fn description(&self) -> &'static str {
        "Clean up old audit log records based on retention settings"
    }

    fn category(&self) -> JobCategory {
        JobCategory::Cleanup
    }

    fn default_schedule(&self) -> Option<&str> {
        Some("@hourly") // Every hour
    }

    async fn run(&self, db: &didhub_db::Db, _cancel_token: &CancellationToken) -> Result<JobOutcome> {
        tracing::debug!("starting audit retention job");

        // Fetch retention days from settings (key: audit.retention.days)
        let setting = db.get_setting("audit.retention.days").await?;
        let Some(s) = setting else {
            tracing::info!("audit retention not configured - skipping");
            return Ok(JobOutcome::new(0, Some("retention not configured".into())));
        };

        // Parse value: allow plain integer in string (e.g. "30") or JSON object/number.
        let days_opt = if let Ok(v) = serde_json::from_str::<serde_json::Value>(&s.value) {
            match v {
                serde_json::Value::Number(n) => n.as_i64(),
                serde_json::Value::String(st) => st.parse::<i64>().ok(),
                _ => None,
            }
        } else {
            s.value.parse::<i64>().ok()
        };

        let Some(days) = days_opt else {
            tracing::warn!(setting_value=%s.value, "invalid audit retention days value");
            return Ok(JobOutcome::new(0, Some("invalid retention days value".into())));
        };

        if days <= 0 {
            tracing::info!(retention_days=%days, "non-positive retention days - skipping audit cleanup");
            return Ok(JobOutcome::new(0, Some("non-positive retention days".into())));
        }

        let cutoff = Utc::now() - Duration::days(days);
        let cutoff_str = cutoff.to_rfc3339();
        tracing::debug!(retention_days=%days, cutoff=%cutoff_str, "purging old audit records");
        let purged = db.purge_audit_before(&cutoff_str).await?;
        tracing::info!(purged_rows=%purged, retention_days=%days, cutoff=%cutoff_str, "audit retention job completed");

        Ok(JobOutcome::new(
            purged,
            Some(format!("purged {} audit rows before {}", purged, cutoff_str))
        ))
    }
}

/// Job for updating metrics gauges
pub struct MetricsUpdateJob;

#[async_trait]
impl Job for MetricsUpdateJob {
    fn name(&self) -> &'static str {
        "metrics_update"
    }

    fn description(&self) -> &'static str {
        "Update Prometheus metrics gauges for entity counts"
    }

    fn category(&self) -> JobCategory {
        JobCategory::Metrics
    }

    fn default_schedule(&self) -> Option<&str> {
        Some("@hourly") // Every hour
    }

    async fn run(&self, db: &didhub_db::Db, _cancel_token: &CancellationToken) -> Result<JobOutcome> {
        tracing::debug!("starting metrics update job");

        // Update user count
        let user_filters = didhub_db::UserListFilters {
            q: None,
            is_admin: None,
            is_system: None,
            is_approved: None,
            sort_by: "id".to_string(),
            order_desc: false,
            limit: 1,
            offset: 0,
        };
        let user_count = if let Ok((_, count)) = db.list_users_advanced(&user_filters).await {
            count
        } else {
            0
        };

        // Update alter count
        let alter_count = if let Ok(count) = db.count_alters(None).await {
            count
        } else {
            0
        };

        // Update system count (users with is_system=1)
        let system_filters = SystemListFilters { q: None };
        let system_count = if let Ok((_, count)) = db.list_system_users(&system_filters, 1, 0).await {
            count
        } else {
            0
        };

        // Update upload count (total, not filtered)
        let upload_count = if let Ok(count) = db.count_uploads_filtered(None, None, None, false).await {
            count
        } else {
            0
        };

        // Update post count
        let post_count = if let Ok(count) = db.count_posts().await {
            count
        } else {
            0
        };

        // Update the gauges
        didhub_metrics::update_entity_gauges(user_count, alter_count, system_count, upload_count, post_count);

        tracing::info!(
            user_count = %user_count,
            alter_count = %alter_count,
            system_count = %system_count,
            upload_count = %upload_count,
            post_count = %post_count,
            "metrics gauges updated"
        );

        Ok(JobOutcome::new(0, Some(format!(
            "updated metrics: users={}, alters={}, systems={}, uploads={}, posts={}",
            user_count, alter_count, system_count, upload_count, post_count
        ))).with_metadata(json!({
            "user_count": user_count,
            "alter_count": alter_count,
            "system_count": system_count,
            "upload_count": upload_count,
            "post_count": post_count
        })))
    }
}

/// Job for cleaning up expired password reset tokens
pub struct ExpiredTokensCleanupJob;

#[async_trait]
impl Job for ExpiredTokensCleanupJob {
    fn name(&self) -> &'static str {
        "expired_tokens_cleanup"
    }

    fn description(&self) -> &'static str {
        "Clean up expired password reset tokens"
    }

    fn category(&self) -> JobCategory {
        JobCategory::Cleanup
    }

    fn default_schedule(&self) -> Option<&str> {
        Some("@daily") // Daily at 3am
    }

    async fn run(&self, db: &didhub_db::Db, _cancel_token: &CancellationToken) -> Result<JobOutcome> {
        tracing::info!("starting expired tokens cleanup job");
        let removed = db.clear_expired_password_resets().await?;
        if removed > 0 {
            audit::record_with_metadata(
                db,
                None,
                "tokens.expired_cleanup",
                Some("housekeeping"),
                None,
                json!({"removed": removed}),
            )
            .await;
        }
        tracing::info!(removed_tokens=%removed, "expired tokens cleanup job completed");
        Ok(JobOutcome::new(
            removed,
            Some(format!("removed {} expired password reset tokens", removed))
        ))
    }
}