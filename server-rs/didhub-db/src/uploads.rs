use anyhow::Result;
use async_trait::async_trait;
use didhub_cache::{AppCache, Cache};
use crate::settings::SettingOperations;
use crate::Db;
use crate::models::{NewUpload, UploadRow};

#[async_trait]
pub trait UploadOperations: Send + Sync {
    async fn insert_upload(&self, nu: NewUpload<'_>) -> Result<UploadRow>;

    // Cache operations
    async fn cached_count_uploads_filtered(
        &self,
        cache: &AppCache,
        mime: Option<&str>,
        hash: Option<&str>,
        user_id: Option<i64>,
        include_deleted: bool,
    ) -> Result<i64>;

    async fn invalidate_upload_counts(&self, cache: &AppCache);

    // File management
    async fn list_upload_filenames(&self) -> Result<Vec<String>>;
    async fn list_uploads_paginated(&self, limit: i64, offset: i64) -> Result<Vec<UploadRow>>;
    async fn fetch_upload_by_name(&self, name: &str) -> Result<Option<UploadRow>>;
    async fn delete_upload_by_name(&self, name: &str) -> Result<i64>;
    async fn soft_delete_upload(&self, name: &str) -> Result<i64>;

    // Filtered operations
    async fn list_uploads_filtered(
        &self,
        mime: Option<&str>,
        hash: Option<&str>,
        user_id: Option<i64>,
        include_deleted: bool,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<UploadRow>>;

    async fn count_uploads_filtered(
        &self,
        mime: Option<&str>,
        hash: Option<&str>,
        user_id: Option<i64>,
        include_deleted: bool,
    ) -> Result<i64>;

    // Maintenance
    async fn purge_deleted_before(&self, cutoff: &str) -> Result<i64>;
}

#[async_trait]
impl UploadOperations for Db {
    async fn insert_upload(&self, nu: NewUpload<'_>) -> Result<UploadRow> {
        let now = chrono::Utc::now().to_rfc3339();
        let stored = nu.stored_name;
        let original = nu.original_name;
        let uid = nu.user_id;
        let mime = nu.mime;
        let bytes = nu.bytes;
        let hash = nu.hash;
        // Insert for all backends
        sqlx::query("INSERT INTO uploads (stored_name, original_name, user_id, mime, bytes, hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
            .bind(stored)
            .bind(original)
            .bind(uid)
            .bind(mime)
            .bind(bytes)
            .bind(hash)
            .bind(&now)
            .execute(&self.pool).await?;
        // Fetch the inserted row
        let rec = sqlx::query_as::<_, UploadRow>("SELECT id, stored_name, original_name, user_id, mime, bytes, hash, created_at, deleted_at FROM uploads WHERE stored_name = ?")
            .bind(stored)
            .fetch_one(&self.pool).await?;
        Ok(rec)
    }

    async fn cached_count_uploads_filtered(
        &self,
        cache: &AppCache,
        mime: Option<&str>,
        hash: Option<&str>,
        user_id: Option<i64>,
        include_deleted: bool,
    ) -> Result<i64> {
        let key = Self::count_cache_key(mime, hash, user_id, include_deleted);
        if let Ok(Some(v)) = cache.get::<i64>(&key).await {
            return Ok(v);
        }
        let real = self
            .count_uploads_filtered(mime, hash, user_id, include_deleted)
            .await?;
        // fetch dynamic TTL setting if available
        let ttl_secs = if let Ok(Some(s)) = self.get_setting("uploads.count_cache.ttl_secs").await {
            s.value.parse::<u64>().unwrap_or(30)
        } else {
            30
        };
        let _ = cache
            .set(
                &key,
                &real,
                Some(std::time::Duration::from_secs(ttl_secs.min(3600))),
            )
            .await; // cap at 1h
        Ok(real)
    }

    async fn invalidate_upload_counts(&self, cache: &AppCache) {
        let _ = cache.del_prefix("uploads:count:").await; // best-effort
    }

    async fn list_upload_filenames(&self) -> Result<Vec<String>> {
        let rows = sqlx::query_as::<_, (String,)>("SELECT stored_name FROM uploads")
            .fetch_all(&self.pool)
            .await?;
        Ok(rows.into_iter().map(|r| r.0).collect())
    }

    async fn list_uploads_paginated(&self, limit: i64, offset: i64) -> Result<Vec<UploadRow>> {
        let rows = sqlx::query_as::<_, UploadRow>("SELECT id, stored_name, original_name, user_id, mime, bytes, hash, created_at, deleted_at FROM uploads ORDER BY created_at DESC, id DESC LIMIT ?1 OFFSET ?2")
            .bind(limit)
            .bind(offset)
            .fetch_all(&self.pool).await?;
        Ok(rows)
    }

    async fn fetch_upload_by_name(&self, name: &str) -> Result<Option<UploadRow>> {
        let rec = sqlx::query_as::<_, UploadRow>("SELECT id, stored_name, original_name, user_id, mime, bytes, hash, created_at, deleted_at FROM uploads WHERE stored_name=?1")
            .bind(name)
            .fetch_optional(&self.pool).await?;
        Ok(rec)
    }

    async fn delete_upload_by_name(&self, name: &str) -> Result<i64> {
        let res = sqlx::query("DELETE FROM uploads WHERE stored_name=?1")
            .bind(name)
            .execute(&self.pool)
            .await?;
        Ok(res.rows_affected() as i64)
    }

    async fn soft_delete_upload(&self, name: &str) -> Result<i64> {
        let now = chrono::Utc::now().to_rfc3339();
        let res = sqlx::query(
            "UPDATE uploads SET deleted_at=?1 WHERE stored_name=?2 AND deleted_at IS NULL",
        )
        .bind(&now)
        .bind(name)
        .execute(&self.pool)
        .await?;
        Ok(res.rows_affected() as i64)
    }

    async fn list_uploads_filtered(
        &self,
        mime: Option<&str>,
        hash: Option<&str>,
        user_id: Option<i64>,
        include_deleted: bool,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<UploadRow>> {
        let mut where_parts: Vec<String> = Vec::new();
        if let Some(_) = mime {
            where_parts.push("mime = ?".into());
        }
        if let Some(_) = hash {
            where_parts.push("hash = ?".into());
        }
        if let Some(_) = user_id {
            where_parts.push("user_id = ?".into());
        }
        if !include_deleted {
            where_parts.push("(deleted_at IS NULL)".into());
        }
        let where_sql = if where_parts.is_empty() {
            String::new()
        } else {
            format!(" WHERE {}", where_parts.join(" AND "))
        };
        let base = format!("SELECT id, stored_name, original_name, user_id, mime, bytes, hash, created_at, deleted_at FROM uploads{} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?", where_sql);
        let mut q = sqlx::query_as::<_, UploadRow>(&base);
        if let Some(m) = mime {
            q = q.bind(m);
        }
        if let Some(h) = hash {
            q = q.bind(h);
        }
        if let Some(u) = user_id {
            q = q.bind(u);
        }
        q = q.bind(limit).bind(offset);
        let rows = q.fetch_all(&self.pool).await?;
        Ok(rows)
    }

    async fn count_uploads_filtered(
        &self,
        mime: Option<&str>,
        hash: Option<&str>,
        user_id: Option<i64>,
        include_deleted: bool,
    ) -> Result<i64> {
        let mut where_parts: Vec<String> = Vec::new();
        if let Some(_) = mime {
            where_parts.push("mime = ?".into());
        }
        if let Some(_) = hash {
            where_parts.push("hash = ?".into());
        }
        if let Some(_) = user_id {
            where_parts.push("user_id = ?".into());
        }
        if !include_deleted {
            where_parts.push("(deleted_at IS NULL)".into());
        }
        let where_sql = if where_parts.is_empty() {
            String::new()
        } else {
            format!(" WHERE {}", where_parts.join(" AND "))
        };
        let sql = format!("SELECT COUNT(*) as c FROM uploads{}", where_sql);
        let mut q = sqlx::query_as::<_, (i64,)>(&sql);
        if let Some(m) = mime {
            q = q.bind(m);
        }
        if let Some(h) = hash {
            q = q.bind(h);
        }
        if let Some(u) = user_id {
            q = q.bind(u);
        }
        let row = q.fetch_one(&self.pool).await?;
        Ok(row.0)
    }

    async fn purge_deleted_before(&self, cutoff: &str) -> Result<i64> {
        let res = sqlx::query("DELETE FROM uploads WHERE deleted_at < ?1")
            .bind(cutoff)
            .execute(&self.pool)
            .await?;
        Ok(res.rows_affected() as i64)
    }
}

impl Db {
    fn count_cache_key(
        mime: Option<&str>,
        hash: Option<&str>,
        user_id: Option<i64>,
        include_deleted: bool,
    ) -> String {
        format!(
            "uploads:count:m={}:h={}:u={}:d={}",
            mime.unwrap_or("*"),
            hash.unwrap_or("*"),
            user_id.map(|i| i.to_string()).unwrap_or("*".into()),
            include_deleted
        )
    }
}