use anyhow::Result;
use async_trait::async_trait;
use crate::common::CommonOperations;
use crate::{Db, DbBackend};
use crate::models::Setting;

#[async_trait]
pub trait SettingOperations: Send + Sync {
    async fn upsert_setting(&self, key: &str, value: &str) -> Result<Setting>;
    async fn get_setting(&self, key: &str) -> Result<Option<Setting>>;
    async fn list_settings(&self) -> Result<Vec<Setting>>;
}

#[async_trait]
impl SettingOperations for Db {
    async fn upsert_setting(&self, key: &str, value: &str) -> Result<Setting> {
        let now = chrono::Utc::now().to_rfc3339();
        match self.backend {
            DbBackend::Sqlite => {
                let rec = sqlx::query_as::<_, Setting>("INSERT INTO settings (key, value, updated_at) VALUES (?1, ?2, ?3) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=?3 RETURNING key, value, updated_at")
                    .bind(key)
                    .bind(value)
                    .bind(&now)
                    .fetch_one(&self.pool).await?;
                Ok(rec)
            }
            DbBackend::Postgres => {
                let rec = sqlx::query_as::<_, Setting>("INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, $3) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value, updated_at=$3 RETURNING key, value, updated_at")
                    .bind(key)
                    .bind(value)
                    .bind(&now)
                    .fetch_one(&self.pool).await?;
                Ok(rec)
            }
            DbBackend::MySql => {
                let key = key.to_string();
                let value = value.to_string();
                let now = now.clone();
                let rec = self.insert_and_return(
                    || async {
                        let sql = "INSERT INTO settings (`key`, `value`, `updated_at`) VALUES (?1, ?2, ?3) ON DUPLICATE KEY UPDATE `value`=VALUES(`value`), `updated_at`=?3 RETURNING key, value, updated_at";
                        let r = sqlx::query_as::<_, Setting>(sql)
                            .bind(&key)
                            .bind(&value)
                            .bind(&now)
                            .fetch_one(&self.pool).await?;
                        Ok(r)
                    },
                    || async {
                        let sql = "INSERT INTO settings (`key`, `value`, `updated_at`) VALUES (?1, ?2, ?3) ON DUPLICATE KEY UPDATE `value`=VALUES(`value`), `updated_at`=?3";
                        sqlx::query(sql).bind(&key).bind(&value).bind(&now).execute(&self.pool).await?;
                        let r = sqlx::query_as::<_, Setting>("SELECT key, value, updated_at FROM settings WHERE `key` = ?1")
                            .bind(&key)
                            .fetch_one(&self.pool).await?;
                        Ok(r)
                    }
                ).await?;
                return Ok(rec);
            }
        }
    }

    async fn get_setting(&self, key: &str) -> Result<Option<Setting>> {
        Ok(
            sqlx::query_as::<_, Setting>(
                "SELECT key, value, updated_at FROM settings WHERE key=?1",
            )
            .bind(key)
            .fetch_optional(&self.pool)
            .await?,
        )
    }

    async fn list_settings(&self) -> Result<Vec<Setting>> {
        Ok(sqlx::query_as::<_, Setting>(
            "SELECT key, value, updated_at FROM settings ORDER BY key ASC",
        )
        .fetch_all(&self.pool)
        .await?)
    }
}