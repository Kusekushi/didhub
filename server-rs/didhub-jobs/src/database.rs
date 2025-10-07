use super::*;
use didhub_db::alters::AlterOperations;
use didhub_db::audit;
use didhub_db::housekeeping::HousekeepingOperations;
use didhub_db::relationships::AlterRelationships;
use didhub_db::settings::SettingOperations;
use serde_json::json;

/// Job for recording upcoming birthdays digest
pub struct BirthdaysDigestJob;

#[async_trait]
impl Job for BirthdaysDigestJob {
    fn name(&self) -> &'static str {
        "birthdays_digest"
    }

    fn description(&self) -> &'static str {
        "Record upcoming birthdays digest for notifications"
    }

    fn category(&self) -> JobCategory {
        JobCategory::Custom
    }

    fn default_schedule(&self) -> Option<&str> {
        Some("@daily") // Daily at 9 AM
    }

    async fn run(
        &self,
        db: &didhub_db::Db,
        _cancel_token: &CancellationToken,
    ) -> Result<JobOutcome> {
        // Check webhook presence (try new key first, fall back to old key for compatibility)
        let webhook = db.get_setting("discord_webhook_url").await?;
        let webhook = if webhook.is_none() {
            db.get_setting("discord.webhook").await?
        } else {
            webhook
        };

        if webhook.is_none() {
            return Ok(JobOutcome::new(0, Some("no webhook configured".into())));
        }

        let alters = db.upcoming_birthdays(7).await.unwrap_or_default();
        if alters.is_empty() {
            return Ok(JobOutcome::new(0, Some("no upcoming birthdays".into())));
        }

        let names: Vec<String> = alters
            .iter()
            .map(|a| {
                if let Some(b) = &a.birthday {
                    format!("{} ({})", a.name, b)
                } else {
                    a.name.clone()
                }
            })
            .collect();

        audit::record_with_metadata(
            db,
            None,
            "digest.birthdays",
            Some("digest"),
            None,
            json!({"count": names.len(), "entries": names}),
        )
        .await;

        Ok(JobOutcome::new(
            alters.len() as i64,
            Some("birthdays digest recorded".into()),
        ))
    }
}

/// Job for pruning orphan group/subsystem memberships
pub struct OrphansPruneJob;

#[async_trait]
impl Job for OrphansPruneJob {
    fn name(&self) -> &'static str {
        "orphans_prune"
    }

    fn description(&self) -> &'static str {
        "Remove orphan group and subsystem memberships"
    }

    fn category(&self) -> JobCategory {
        JobCategory::Cleanup
    }

    fn default_schedule(&self) -> Option<&str> {
        Some("@daily") // Daily cleanup
    }

    async fn run(
        &self,
        db: &didhub_db::Db,
        _cancel_token: &CancellationToken,
    ) -> Result<JobOutcome> {
        // Example orphan conditions: group_members referencing missing group or alter
        let removed = db.prune_orphan_group_members().await.unwrap_or(0)
            + db.prune_orphan_subsystem_members().await.unwrap_or(0);

        if removed > 0 {
            audit::record_with_metadata(
                db,
                None,
                "orphans.prune",
                Some("housekeeping"),
                None,
                json!({"removed": removed}),
            )
            .await;
        }

        Ok(JobOutcome::new(
            removed,
            Some(format!("removed {} orphan membership rows", removed)),
        ))
    }
}

/// Job for performing database maintenance/vacuum
pub struct VacuumDbJob;

#[async_trait]
impl Job for VacuumDbJob {
    fn name(&self) -> &'static str {
        "db_vacuum"
    }

    fn description(&self) -> &'static str {
        "Perform database maintenance operations"
    }

    fn category(&self) -> JobCategory {
        JobCategory::Maintenance
    }

    fn default_schedule(&self) -> Option<&str> {
        Some("@monthly") // Monthly on the 1st at 4 AM
    }

    async fn run(
        &self,
        db: &didhub_db::Db,
        _cancel_token: &CancellationToken,
    ) -> Result<JobOutcome> {
        let affected = db.perform_database_maintenance().await?;
        audit::record_simple(db, None, "db.vacuum").await;
        Ok(JobOutcome::new(
            affected,
            Some("vacuum/optimize invoked".into()),
        ))
    }
}
