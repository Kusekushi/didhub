use crate::models::*;
use crate::{Db, DbBackend};
use anyhow::Result;
use async_trait::async_trait;
use serde_json;

#[async_trait]
pub trait CommonOperations: Send + Sync {
    /// Generic helper for databases that don't support RETURNING clauses
    async fn insert_and_return<T, F1, F2, Fut1, Fut2>(
        &self,
        sqlite_postgres_fn: F1,
        mysql_fn: F2,
    ) -> Result<T>
    where
        F1: FnOnce() -> Fut1 + Send,
        F2: FnOnce() -> Fut2 + Send,
        Fut1: std::future::Future<Output = Result<T>> + Send,
        Fut2: std::future::Future<Output = Result<T>> + Send,
        T: Send;

    // Audit operations
    async fn insert_audit(
        &self,
        user_id: Option<&str>,
        action: &str,
        entity_type: Option<&str>,
        entity_id: Option<&str>,
        ip: Option<&str>,
        metadata_json: Option<&serde_json::Value>,
    ) -> Result<()>;

    async fn list_audit(
        &self,
        action: Option<&str>,
        user_id: Option<&str>,
        from: Option<&str>,
        to: Option<&str>,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<AuditLog>>;

    async fn purge_audit_before(&self, before: &str) -> Result<i64>;
    async fn clear_audit(&self) -> Result<i64>;

    // Housekeeping operations
    async fn start_housekeeping_run(&self, job_name: &str) -> Result<HousekeepingRun>;

    async fn finish_housekeeping_run(
        &self,
        id: &str,
        success: bool,
        message: Option<&str>,
        rows: Option<i64>,
    ) -> Result<()>;

    async fn list_housekeeping_runs(
        &self,
        job_name: Option<&str>,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<HousekeepingRun>>;

    async fn clear_housekeeping_runs(&self, job_name: Option<&str>) -> Result<i64>;
}

#[async_trait]
impl CommonOperations for Db {
    async fn insert_and_return<T, F1, F2, Fut1, Fut2>(
        &self,
        sqlite_postgres_fn: F1,
        mysql_fn: F2,
    ) -> Result<T>
    where
        F1: FnOnce() -> Fut1 + Send,
        F2: FnOnce() -> Fut2 + Send,
        Fut1: std::future::Future<Output = Result<T>> + Send,
        Fut2: std::future::Future<Output = Result<T>> + Send,
        T: Send,
    {
        match self.backend {
            DbBackend::Sqlite | DbBackend::Postgres => sqlite_postgres_fn().await,
            DbBackend::MySql => mysql_fn().await,
        }
    }

    async fn insert_audit(
        &self,
        user_id: Option<&str>,
        action: &str,
        entity_type: Option<&str>,
        entity_id: Option<&str>,
        ip: Option<&str>,
        metadata_json: Option<&serde_json::Value>,
    ) -> Result<()> {
        let metadata_str = metadata_json.map(|v| serde_json::to_string(v).unwrap());
        let now = chrono::Utc::now().to_rfc3339();
        let id = uuid::Uuid::new_v4().to_string();
        sqlx::query("INSERT INTO audit_log (id, created_at, user_id, action, entity_type, entity_id, ip, metadata) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)")
            .bind(&id)
            .bind(now)
            .bind(user_id)
            .bind(action)
            .bind(entity_type)
            .bind(entity_id)
            .bind(ip)
            .bind(metadata_str)
            .execute(&self.pool).await?;
        Ok(())
    }

    async fn list_audit(
        &self,
        action: Option<&str>,
        user_id: Option<&str>,
        from: Option<&str>,
        to: Option<&str>,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<AuditLog>> {
        let mut sql = String::from("SELECT * FROM audit_log");
        let mut conds: Vec<String> = Vec::new();
        if action.is_some() {
            conds.push("action=?".into());
        }
        if user_id.is_some() {
            conds.push("user_id=?".into());
        }
        if from.is_some() {
            conds.push("created_at >= ?".into());
        }
        if to.is_some() {
            conds.push("created_at <= ?".into());
        }
        if !conds.is_empty() {
            sql.push_str(" WHERE ");
            sql.push_str(&conds.join(" AND "));
        }
        sql.push_str(" ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?");
        let mut q = sqlx::query_as::<_, AuditLog>(&sql);
        if let Some(a) = action {
            q = q.bind(a);
        }
        if let Some(u) = user_id {
            q = q.bind(u);
        }
        if let Some(f) = from {
            q = q.bind(f);
        }
        if let Some(t) = to {
            q = q.bind(t);
        }
        q = q.bind(limit).bind(offset);
        let rows = q.fetch_all(&self.pool).await?;
        Ok(rows)
    }

    async fn purge_audit_before(&self, before: &str) -> Result<i64> {
        let res = sqlx::query("DELETE FROM audit_log WHERE created_at < ?1")
            .bind(before)
            .execute(&self.pool)
            .await?;
        Ok(res.rows_affected() as i64)
    }

    async fn clear_audit(&self) -> Result<i64> {
        let res = sqlx::query("DELETE FROM audit_log")
            .execute(&self.pool)
            .await?;
        Ok(res.rows_affected() as i64)
    }

    async fn start_housekeeping_run(&self, job_name: &str) -> Result<HousekeepingRun> {
        let id = uuid::Uuid::new_v4().to_string();
        let job_name = job_name.to_string();
        let rec = self.insert_and_return(
            || async {
                let r = sqlx::query_as::<_, HousekeepingRun>("INSERT INTO housekeeping_runs (id, job_name) VALUES (?1, ?2) RETURNING id, job_name, started_at, finished_at, status, message, rows_affected")
                    .bind(&id)
                    .bind(&job_name)
                    .fetch_one(&self.pool).await?;
                Ok(r)
            },
            || async {
                sqlx::query("INSERT INTO housekeeping_runs (id, job_name) VALUES (?1, ?2)")
                    .bind(&id)
                    .bind(&job_name)
                    .execute(&self.pool).await?;
                let r = sqlx::query_as::<_, HousekeepingRun>("SELECT id, job_name, started_at, finished_at, status, message, rows_affected FROM housekeeping_runs WHERE id = ?1")
                    .bind(&id)
                    .fetch_one(&self.pool).await?;
                Ok(r)
            }
        ).await?;
        Ok(rec)
    }

    async fn finish_housekeeping_run(
        &self,
        id: &str,
        success: bool,
        message: Option<&str>,
        rows: Option<i64>,
    ) -> Result<()> {
        let now = chrono::Utc::now().to_rfc3339();
        sqlx::query("UPDATE housekeeping_runs SET finished_at=?1, status=?2, message=?3, rows_affected=?4 WHERE id=?5")
            .bind(&now)
            .bind(if success { "success" } else { "error" })
            .bind(message)
            .bind(rows)
            .bind(id)
            .execute(&self.pool).await?;
        Ok(())
    }

    async fn list_housekeeping_runs(
        &self,
        job_name: Option<&str>,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<HousekeepingRun>> {
        let mut sql = String::from("SELECT id, job_name, started_at, finished_at, status, message, rows_affected FROM housekeeping_runs");
        if job_name.is_some() {
            sql.push_str(" WHERE job_name=?1");
        }
        sql.push_str(" ORDER BY started_at DESC, id DESC LIMIT ?2 OFFSET ?3");
        let mut q = sqlx::query_as::<_, HousekeepingRun>(&sql);
        if let Some(j) = job_name {
            q = q.bind(j);
        }
        q = q.bind(limit).bind(offset);
        Ok(q.fetch_all(&self.pool).await?)
    }

    async fn clear_housekeeping_runs(&self, job_name: Option<&str>) -> Result<i64> {
        let (sql, bind_job) = if job_name.is_some() {
            ("DELETE FROM housekeeping_runs WHERE job_name=?1", true)
        } else {
            ("DELETE FROM housekeeping_runs", false)
        };
        let mut q = sqlx::query(sql);
        if let Some(j) = job_name {
            if bind_job {
                q = q.bind(j);
            }
        }
        let res = q.execute(&self.pool).await?;
        Ok(res.rows_affected() as i64)
    }
}
