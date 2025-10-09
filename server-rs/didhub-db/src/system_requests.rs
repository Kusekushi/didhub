use crate::common::CommonOperations;
use crate::models::{SystemRequest, SystemRequestAdmin};
use crate::Db;
use anyhow::Result;
use async_trait::async_trait;

#[async_trait]
pub trait SystemRequestOperations: Send + Sync {
    async fn create_system_request(&self, user_id: &str) -> Result<SystemRequest>;
    async fn fetch_system_request(&self, id: &str) -> Result<Option<SystemRequest>>;
    async fn fetch_latest_system_request_for_user(
        &self,
        user_id: &str,
    ) -> Result<Option<SystemRequest>>;
    async fn list_system_requests(
        &self,
        status: Option<&str>,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<SystemRequest>>;
    async fn list_system_requests_admin(
        &self,
        status: Option<&str>,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<SystemRequestAdmin>>;
    async fn decide_system_request(
        &self,
        id: &str,
        approve: bool,
        note: Option<&str>,
    ) -> Result<Option<SystemRequest>>;
}

#[async_trait]
impl SystemRequestOperations for Db {
    async fn create_system_request(&self, user_id: &str) -> Result<SystemRequest> {
        // ensure only one pending per user (return existing pending if present)
        if let Some(existing) = sqlx::query_as::<_, SystemRequest>("SELECT * FROM system_requests WHERE user_id=?1 AND status='pending' ORDER BY id DESC LIMIT 1")
            .bind(user_id)
            .fetch_optional(&self.pool).await? { return Ok(existing); }
        let rec = self
            .insert_and_return(
                || async {
                    let r = sqlx::query_as::<_, SystemRequest>(
                        "INSERT INTO system_requests (user_id) VALUES (?1) RETURNING *",
                    )
                    .bind(user_id)
                    .fetch_one(&self.pool)
                    .await?;
                    Ok(r)
                },
                || async {
                    sqlx::query("INSERT INTO system_requests (user_id) VALUES (?1)")
                        .bind(user_id)
                        .execute(&self.pool)
                        .await?;
                    let r = sqlx::query_as::<_, SystemRequest>(
                        "SELECT * FROM system_requests WHERE id = LAST_INSERT_ID()",
                    )
                    .fetch_one(&self.pool)
                    .await?;
                    Ok(r)
                },
            )
            .await?;
        Ok(rec)
    }

    async fn fetch_system_request(&self, id: &str) -> Result<Option<SystemRequest>> {
        Ok(
            sqlx::query_as::<_, SystemRequest>("SELECT * FROM system_requests WHERE id=?1")
                .bind(id)
                .fetch_optional(&self.pool)
                .await?,
        )
    }

    async fn fetch_latest_system_request_for_user(
        &self,
        user_id: &str,
    ) -> Result<Option<SystemRequest>> {
        Ok(sqlx::query_as::<_, SystemRequest>(
            "SELECT * FROM system_requests WHERE user_id=?1 ORDER BY id DESC LIMIT 1",
        )
        .bind(user_id)
        .fetch_optional(&self.pool)
        .await?)
    }

    async fn list_system_requests(
        &self,
        status: Option<&str>,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<SystemRequest>> {
        let rows = if let Some(st) = status {
            sqlx::query_as::<_, SystemRequest>(
                "SELECT * FROM system_requests WHERE status=?1 ORDER BY id DESC LIMIT ?2 OFFSET ?3",
            )
            .bind(st)
            .bind(limit)
            .bind(offset)
            .fetch_all(&self.pool)
            .await?
        } else {
            sqlx::query_as::<_, SystemRequest>(
                "SELECT * FROM system_requests ORDER BY id DESC LIMIT ?1 OFFSET ?2",
            )
            .bind(limit)
            .bind(offset)
            .fetch_all(&self.pool)
            .await?
        };
        Ok(rows)
    }

    async fn list_system_requests_admin(
        &self,
        status: Option<&str>,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<SystemRequestAdmin>> {
        let rows = if let Some(st) = status {
            sqlx::query_as::<_, SystemRequestAdmin>(
                "SELECT sr.id, sr.user_id, u.username, sr.status, sr.note, sr.decided_at, sr.created_at 
                 FROM system_requests sr 
                 JOIN users u ON sr.user_id = u.id 
                 WHERE sr.status=?1 ORDER BY sr.id DESC LIMIT ?2 OFFSET ?3",
            )
            .bind(st)
            .bind(limit)
            .bind(offset)
            .fetch_all(&self.pool)
            .await?
        } else {
            sqlx::query_as::<_, SystemRequestAdmin>(
                "SELECT sr.id, sr.user_id, u.username, sr.status, sr.note, sr.decided_at, sr.created_at 
                 FROM system_requests sr 
                 JOIN users u ON sr.user_id = u.id 
                 ORDER BY sr.id DESC LIMIT ?1 OFFSET ?2",
            )
            .bind(limit)
            .bind(offset)
            .fetch_all(&self.pool)
            .await?
        };
        Ok(rows)
    }

    async fn decide_system_request(
        &self,
        id: &str,
        approve: bool,
        note: Option<&str>,
    ) -> Result<Option<SystemRequest>> {
        // only pending can transition
        let mut tx = self.pool.begin().await?;
        let existing =
            sqlx::query_as::<_, SystemRequest>("SELECT * FROM system_requests WHERE id=?1")
                .bind(id)
                .fetch_optional(&mut *tx)
                .await?;
        let Some(req) = existing else {
            return Ok(None);
        };
        if req.status != "pending" {
            return Ok(Some(req));
        }
        let new_status = if approve { "approved" } else { "denied" };
        let now = chrono::Utc::now().to_rfc3339();
        sqlx::query("UPDATE system_requests SET status=?1, note=?2, decided_at=?3 WHERE id=?4")
            .bind(new_status)
            .bind(note)
            .bind(&now)
            .bind(id)
            .execute(&mut *tx)
            .await?;
        // if approved, set user.is_system=1, is_approved=1
        if approve {
            sqlx::query("UPDATE users SET is_system=1, is_approved=1 WHERE id=?1")
                .bind(req.user_id)
                .execute(&mut *tx)
                .await?;
        }
        tx.commit().await?;
        let updated = self.fetch_system_request(id).await?;
        Ok(updated)
    }
}
