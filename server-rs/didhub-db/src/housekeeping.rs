use crate::{Db, DbBackend};
use anyhow::Result;
use async_trait::async_trait;

#[async_trait]
pub trait HousekeepingOperations {
    /// Run database maintenance operations (VACUUM for SQLite, ANALYZE for others)
    async fn perform_database_maintenance(&self) -> Result<i64>;
}

#[async_trait]
impl HousekeepingOperations for Db {
    async fn perform_database_maintenance(&self) -> Result<i64> {
        let mut affected: i64 = 0;
        match self.backend {
            DbBackend::Sqlite => {
                if sqlx::query("VACUUM").execute(&self.pool).await.is_ok() {
                    affected = 1;
                }
            }
            DbBackend::Postgres => {
                // Run ANALYZE (cannot VACUUM without superuser in some environments)
                let _ = sqlx::query("ANALYZE").execute(&self.pool).await;
            }
            DbBackend::MySql => {
                // Optimize all tables (could be heavy). Limit to a subset? For now run ANALYZE TABLE users.
                let _ = sqlx::query("ANALYZE TABLE users").execute(&self.pool).await;
            }
        }
        Ok(affected)
    }
}
