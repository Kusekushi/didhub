use anyhow::Result;
use async_trait::async_trait;
use crate::{Db, DbBackend};
use crate::models::Shortlink;

#[async_trait]
pub trait ShortlinkOperations: Send + Sync {
    async fn create_shortlink(
        &self,
        token: &str,
        target: &str,
        created_by_user_id: Option<i64>,
    ) -> Result<Shortlink>;

    async fn fetch_shortlink_by_token(&self, token: &str) -> Result<Option<Shortlink>>;
    async fn fetch_shortlink_by_id(&self, id: i64) -> Result<Option<Shortlink>>;
    async fn delete_shortlink(&self, id: i64) -> Result<bool>;
    async fn prune_old_shortlinks(&self, cutoff: &str) -> Result<i64>;
}

#[async_trait]
impl ShortlinkOperations for Db {
    async fn create_shortlink(
        &self,
        token: &str,
        target: &str,
        created_by_user_id: Option<i64>,
    ) -> Result<Shortlink> {
        if token.trim().is_empty() || target.trim().is_empty() {
            anyhow::bail!("token and target required");
        }
        let rec = match self.backend {
            DbBackend::Sqlite => {
                sqlx::query("INSERT INTO shortlinks (token, target, created_by_user_id) VALUES (?1, ?2, ?3)")
                    .bind(token)
                    .bind(target)
                    .bind(created_by_user_id)
                    .execute(&self.pool).await?;
                sqlx::query_as::<_, Shortlink>("SELECT id, token, target, created_by_user_id, created_at FROM shortlinks WHERE id = last_insert_rowid()")
                    .fetch_one(&self.pool).await?
            }
            DbBackend::Postgres => {
                sqlx::query_as::<_, Shortlink>("INSERT INTO shortlinks (token, target, created_by_user_id) VALUES ($1, $2, $3) RETURNING *")
                    .bind(token)
                    .bind(target)
                    .bind(created_by_user_id)
                    .fetch_one(&self.pool).await?
            }
            DbBackend::MySql => {
                sqlx::query("INSERT INTO shortlinks (token, target, created_by_user_id) VALUES (?1, ?2, ?3)")
                    .bind(token)
                    .bind(target)
                    .bind(created_by_user_id)
                    .execute(&self.pool).await?;
                sqlx::query_as::<_, Shortlink>("SELECT id, token, target, created_by_user_id, created_at FROM shortlinks WHERE id = LAST_INSERT_ID()")
                    .fetch_one(&self.pool).await?
            }
        };
        Ok(rec)
    }

    async fn fetch_shortlink_by_token(&self, token: &str) -> Result<Option<Shortlink>> {
        Ok(
            sqlx::query_as::<_, Shortlink>("SELECT id, token, target, created_by_user_id, created_at FROM shortlinks WHERE token=?1")
                .bind(token)
                .fetch_optional(&self.pool)
                .await?,
        )
    }

    async fn fetch_shortlink_by_id(&self, id: i64) -> Result<Option<Shortlink>> {
        Ok(
            sqlx::query_as::<_, Shortlink>("SELECT id, token, target, created_by_user_id, created_at FROM shortlinks WHERE id=?1")
                .bind(id)
                .fetch_optional(&self.pool)
                .await?,
        )
    }

    async fn delete_shortlink(&self, id: i64) -> Result<bool> {
        let res = sqlx::query("DELETE FROM shortlinks WHERE id=?1")
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(res.rows_affected() > 0)
    }

    async fn prune_old_shortlinks(&self, cutoff: &str) -> Result<i64> {
        let res = sqlx::query("DELETE FROM shortlinks WHERE created_at < ?1")
            .bind(cutoff)
            .execute(&self.pool)
            .await?;
        Ok(res.rows_affected() as i64)
    }
}