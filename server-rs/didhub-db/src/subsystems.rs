use crate::entity_ops::{delete_entity, update_entity};
use crate::models::{Db, Subsystem};
use crate::DbBackend;
use anyhow::Result;
use async_trait::async_trait;
use didhub_metrics::record_db_operation;
use std::time::Instant;

#[async_trait]
pub trait SubsystemOperations {
    /// Create a new subsystem
    async fn create_subsystem(
        &self,
        name: &str,
        description: Option<&str>,
        leaders: &[String],
        metadata: Option<&str>,
        owner_user_id: Option<&str>,
    ) -> Result<Subsystem>;

    /// Fetch a subsystem by ID
    async fn fetch_subsystem(&self, id: &str) -> Result<Option<Subsystem>>;

    /// List subsystems with optional search and pagination
    async fn list_subsystems(
        &self,
        q: Option<String>,
        limit: i64,
        offset: i64,
        owner_user_id: Option<&str>,
    ) -> Result<Vec<Subsystem>>;

    /// Count subsystems with optional search
    async fn count_subsystems(&self, q: Option<String>, owner_user_id: Option<&str>)
        -> Result<i64>;

    /// Update a subsystem
    async fn update_subsystem(
        &self,
        id: &str,
        body: &serde_json::Value,
    ) -> Result<Option<Subsystem>>;

    /// Delete a subsystem
    async fn delete_subsystem(&self, id: &str) -> Result<bool>;

    /// Add an alter to a subsystem
    async fn add_alter_to_subsystem(&self, alter_id: &str, subsystem_id: &str) -> Result<()>;

    /// Remove an alter from a subsystem
    async fn remove_alter_from_subsystem(&self, alter_id: &str, subsystem_id: &str) -> Result<()>;

    /// List all alters in a subsystem
    async fn list_alters_in_subsystem(&self, subsystem_id: &str) -> Result<Vec<String>>;

    /// Get the single subsystem id for a given alter (or None)
    async fn get_subsystem_for_alter(&self, alter_id: &str) -> Result<Option<String>>;

    /// Set the single subsystem membership for an alter. Passing None will remove
    /// any existing membership. This enforces the invariant that an alter can
    /// belong to at most one subsystem.
    async fn set_subsystem_for_alter(
        &self,
        alter_id: &str,
        subsystem_id: Option<&str>,
    ) -> Result<()>;

    /// Batch load members for multiple subsystems
    async fn batch_load_subsystem_members(
        &self,
        subsystem_ids: &[&str],
    ) -> Result<std::collections::HashMap<String, Vec<String>>>;
}

#[async_trait]
impl SubsystemOperations for Db {
    async fn create_subsystem(
        &self,
        name: &str,
        description: Option<&str>,
        leaders: &[String],
        metadata: Option<&str>,
        owner_user_id: Option<&str>,
    ) -> Result<Subsystem> {
        let start = Instant::now();
        if name.trim().is_empty() {
            record_db_operation("create", "subsystems", "error", start.elapsed());
            anyhow::bail!("name required");
        }
        let leaders_json = if leaders.is_empty() {
            None
        } else {
            Some(serde_json::to_string(leaders).unwrap())
        };
        let id = uuid::Uuid::new_v4().to_string();
        // Insert the new subsystem row (explicitly providing id) for each backend.
        match self.backend {
            DbBackend::Sqlite => {
                sqlx::query("INSERT INTO subsystems (id, name, description, leaders, metadata, owner_user_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6)")
                    .bind(&id)
                    .bind(name)
                    .bind(description)
                    .bind(leaders_json)
                    .bind(metadata)
                    .bind(owner_user_id)
                    .execute(&self.pool).await?;
            }
            DbBackend::Postgres => {
                sqlx::query("INSERT INTO subsystems (id, name, description, leaders, metadata, owner_user_id) VALUES ($1, $2, $3, $4, $5, $6)")
                    .bind(&id)
                    .bind(name)
                    .bind(description)
                    .bind(leaders_json)
                    .bind(metadata)
                    .bind(owner_user_id)
                    .execute(&self.pool).await?;
            }
            DbBackend::MySql => {
                sqlx::query("INSERT INTO subsystems (id, name, description, leaders, metadata, owner_user_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6)")
                    .bind(&id)
                    .bind(name)
                    .bind(description)
                    .bind(leaders_json)
                    .bind(metadata)
                    .bind(owner_user_id)
                    .execute(&self.pool).await?;
            }
        }

        // Fetch a consistent projection matching the Subsystem model. Some DB
        // schemas may not have avatar/banner/color/updated_at. We alias
        // NULL/defaults to allow decoding.
        let rec = sqlx::query_as::<_, Subsystem>(
            "SELECT id, name, description, NULL as avatar_url, NULL as banner_url, NULL as color, leaders, metadata, owner_user_id, CAST(created_at AS TEXT) as created_at, CAST(created_at AS TEXT) as updated_at FROM subsystems WHERE id = ?1",
        )
        .bind(&id)
        .fetch_one(&self.pool)
        .await?;
        record_db_operation("create", "subsystems", "success", start.elapsed());
        Ok(rec)
    }

    async fn fetch_subsystem(&self, id: &str) -> Result<Option<Subsystem>> {
        let start = Instant::now();
        let result = match self.backend {
            DbBackend::Sqlite => {
                sqlx::query_as::<_, Subsystem>(
                    "SELECT id, name, description, NULL as avatar_url, NULL as banner_url, NULL as color, leaders, metadata, owner_user_id, CAST(created_at AS TEXT) as created_at, CAST(created_at AS TEXT) as updated_at FROM subsystems WHERE id=?1"
                )
                .bind(id)
                .fetch_optional(&self.pool)
                .await?
            }
            _ => sqlx::query_as::<_, Subsystem>("SELECT * FROM subsystems WHERE id=?1").bind(id).fetch_optional(&self.pool).await?,
        };
        record_db_operation(
            "fetch",
            "subsystems",
            if result.is_some() {
                "success"
            } else {
                "not_found"
            },
            start.elapsed(),
        );
        Ok(result)
    }

    async fn list_subsystems(
        &self,
        q: Option<String>,
        limit: i64,
        offset: i64,
        owner_user_id: Option<&str>,
    ) -> Result<Vec<Subsystem>> {
        let start = Instant::now();
        let rows = match (q, owner_user_id) {
            (Some(qs), Some(owner_id)) => {
                let like = format!("%{}%", qs);
                match self.backend {
                    DbBackend::Sqlite => sqlx::query_as::<_, Subsystem>("SELECT id, name, description, NULL as avatar_url, NULL as banner_url, NULL as color, leaders, metadata, owner_user_id, CAST(created_at AS TEXT) as created_at, CAST(created_at AS TEXT) as updated_at FROM subsystems WHERE name LIKE ?1 AND owner_user_id = ?2 ORDER BY id DESC LIMIT ?3 OFFSET ?4").bind(like).bind(owner_id).bind(limit).bind(offset).fetch_all(&self.pool).await?,
                    _ => sqlx::query_as::<_, Subsystem>("SELECT * FROM subsystems WHERE name LIKE ?1 AND owner_user_id = ?2 ORDER BY id DESC LIMIT ?3 OFFSET ?4").bind(like).bind(owner_id).bind(limit).bind(offset).fetch_all(&self.pool).await?,
                }
            },
            (Some(qs), None) => {
                let like = format!("%{}%", qs);
                match self.backend {
                    DbBackend::Sqlite => sqlx::query_as::<_, Subsystem>("SELECT id, name, description, NULL as avatar_url, NULL as banner_url, NULL as color, leaders, metadata, owner_user_id, CAST(created_at AS TEXT) as created_at, CAST(created_at AS TEXT) as updated_at FROM subsystems WHERE name LIKE ?1 ORDER BY id DESC LIMIT ?2 OFFSET ?3").bind(like).bind(limit).bind(offset).fetch_all(&self.pool).await?,
                    _ => sqlx::query_as::<_, Subsystem>("SELECT * FROM subsystems WHERE name LIKE ?1 ORDER BY id DESC LIMIT ?2 OFFSET ?3").bind(like).bind(limit).bind(offset).fetch_all(&self.pool).await?,
                }
            },
            (None, Some(owner_id)) => {
                match self.backend {
                    DbBackend::Sqlite => sqlx::query_as::<_, Subsystem>("SELECT id, name, description, NULL as avatar_url, NULL as banner_url, NULL as color, leaders, metadata, owner_user_id, CAST(created_at AS TEXT) as created_at, CAST(created_at AS TEXT) as updated_at FROM subsystems WHERE owner_user_id = ?1 ORDER BY id DESC LIMIT ?2 OFFSET ?3").bind(owner_id).bind(limit).bind(offset).fetch_all(&self.pool).await?,
                    _ => sqlx::query_as::<_, Subsystem>("SELECT * FROM subsystems WHERE owner_user_id = ?1 ORDER BY id DESC LIMIT ?2 OFFSET ?3").bind(owner_id).bind(limit).bind(offset).fetch_all(&self.pool).await?,
                }
            },
            (None, None) => {
                match self.backend {
                    DbBackend::Sqlite => sqlx::query_as::<_, Subsystem>("SELECT id, name, description, NULL as avatar_url, NULL as banner_url, NULL as color, leaders, metadata, owner_user_id, CAST(created_at AS TEXT) as created_at, CAST(created_at AS TEXT) as updated_at FROM subsystems ORDER BY id DESC LIMIT ?1 OFFSET ?2").bind(limit).bind(offset).fetch_all(&self.pool).await?,
                    _ => sqlx::query_as::<_, Subsystem>("SELECT * FROM subsystems ORDER BY id DESC LIMIT ?1 OFFSET ?2").bind(limit).bind(offset).fetch_all(&self.pool).await?,
                }
            },
        };
        record_db_operation("list", "subsystems", "success", start.elapsed());
        Ok(rows)
    }

    async fn count_subsystems(
        &self,
        q: Option<String>,
        owner_user_id: Option<&str>,
    ) -> Result<i64> {
        let start = Instant::now();
        let result = match (q, owner_user_id) {
            (Some(qs), Some(owner_id)) => {
                let like = format!("%{}%", qs);
                let (c,): (i64,) = sqlx::query_as(
                    "SELECT count(*) FROM subsystems WHERE name LIKE ?1 AND owner_user_id = ?2",
                )
                .bind(like)
                .bind(owner_id)
                .fetch_one(&self.pool)
                .await?;
                c
            }
            (Some(qs), None) => {
                let like = format!("%{}%", qs);
                let (c,): (i64,) =
                    sqlx::query_as("SELECT count(*) FROM subsystems WHERE name LIKE ?1")
                        .bind(like)
                        .fetch_one(&self.pool)
                        .await?;
                c
            }
            (None, Some(owner_id)) => {
                let (c,): (i64,) =
                    sqlx::query_as("SELECT count(*) FROM subsystems WHERE owner_user_id = ?1")
                        .bind(owner_id)
                        .fetch_one(&self.pool)
                        .await?;
                c
            }
            (None, None) => {
                let (c,): (i64,) = sqlx::query_as("SELECT count(*) FROM subsystems")
                    .fetch_one(&self.pool)
                    .await?;
                c
            }
        };
        record_db_operation("count", "subsystems", "success", start.elapsed());
        Ok(result)
    }

    async fn update_subsystem(
        &self,
        id: &str,
        body: &serde_json::Value,
    ) -> Result<Option<Subsystem>> {
        let start = Instant::now();
        if body.as_object().map(|m| m.is_empty()).unwrap_or(true) {
            let result = self.fetch_subsystem(id).await;
            record_db_operation("update", "subsystems", "no_changes", start.elapsed());
            return result;
        }
        update_entity(
            self,
            "subsystems",
            id,
            body,
            &[
                "name",
                "description",
                "leaders",
                "metadata",
                "owner_user_id",
            ],
        )
        .await?;
        let result = self.fetch_subsystem(id).await;
        record_db_operation(
            "update",
            "subsystems",
            if result.is_ok() && result.as_ref().unwrap().is_some() {
                "success"
            } else {
                "error"
            },
            start.elapsed(),
        );
        result
    }

    async fn delete_subsystem(&self, id: &str) -> Result<bool> {
        let start = Instant::now();
        let result = delete_entity(self, "subsystems", id).await;
        record_db_operation(
            "delete",
            "subsystems",
            if result.is_ok() && *result.as_ref().unwrap() {
                "success"
            } else {
                "not_found"
            },
            start.elapsed(),
        );
        result
    }

    async fn add_alter_to_subsystem(&self, alter_id: &str, subsystem_id: &str) -> Result<()> {
        let start = Instant::now();
        sqlx::query(
            "INSERT OR IGNORE INTO alter_subsystems (alter_id, subsystem_id) VALUES (?1, ?2)",
        )
        .bind(alter_id)
        .bind(subsystem_id)
        .execute(&self.pool)
        .await?;
        record_db_operation("add_member", "subsystems", "success", start.elapsed());
        Ok(())
    }

    async fn remove_alter_from_subsystem(&self, alter_id: &str, subsystem_id: &str) -> Result<()> {
        let start = Instant::now();
        sqlx::query("DELETE FROM alter_subsystems WHERE alter_id=?1 AND subsystem_id=?2")
            .bind(alter_id)
            .bind(subsystem_id)
            .execute(&self.pool)
            .await?;
        record_db_operation("remove_member", "subsystems", "success", start.elapsed());
        Ok(())
    }

    async fn list_alters_in_subsystem(&self, subsystem_id: &str) -> Result<Vec<String>> {
        let start = Instant::now();
        let rows = sqlx::query_as::<_, (String,)>(
            "SELECT alter_id FROM alter_subsystems WHERE subsystem_id=?1",
        )
        .bind(subsystem_id)
        .fetch_all(&self.pool)
        .await?;
        let result = rows.into_iter().map(|r| r.0).collect();
        record_db_operation("list_members", "subsystems", "success", start.elapsed());
        Ok(result)
    }

    async fn batch_load_subsystem_members(
        &self,
        subsystem_ids: &[&str],
    ) -> Result<std::collections::HashMap<String, Vec<String>>> {
        let start = Instant::now();
        use std::collections::HashMap;

        if subsystem_ids.is_empty() {
            record_db_operation("batch_load_members", "subsystems", "empty", start.elapsed());
            return Ok(HashMap::new());
        }

        // Create placeholders for IN clause
        let placeholders: Vec<String> = (0..subsystem_ids.len())
            .map(|i| format!("?{}", i + 1))
            .collect();
        let placeholders_str = placeholders.join(",");

        // Batch query all subsystem members
        let query = format!(
            "SELECT subsystem_id, alter_id FROM alter_subsystems WHERE subsystem_id IN ({})",
            placeholders_str
        );
        let mut q = sqlx::query_as::<_, (String, String)>(&query);
        for id in subsystem_ids {
            q = q.bind(id);
        }
        let rows = q.fetch_all(&self.pool).await?;

        // Build the result map
        let mut result: HashMap<String, Vec<String>> = HashMap::new();
        for &id in subsystem_ids {
            result.insert(id.to_string(), Vec::new());
        }

        // Process members
        for (subsystem_id, alter_id) in rows {
            if let Some(alters) = result.get_mut(&subsystem_id) {
                alters.push(alter_id);
            }
        }

        // Sort the alter IDs
        for alters in result.values_mut() {
            alters.sort();
        }

        record_db_operation(
            "batch_load_members",
            "subsystems",
            "success",
            start.elapsed(),
        );
        Ok(result)
    }
    async fn get_subsystem_for_alter(&self, alter_id: &str) -> Result<Option<String>> {
        let start = Instant::now();
        let row = sqlx::query_as::<_, (String,)>(
            "SELECT subsystem_id FROM alter_subsystems WHERE alter_id=?1 ORDER BY subsystem_id ASC LIMIT 1",
        )
        .bind(alter_id)
        .fetch_optional(&self.pool)
        .await?;
        record_db_operation("get_membership", "subsystems", "success", start.elapsed());
        Ok(row.map(|r| r.0))
    }

    async fn set_subsystem_for_alter(
        &self,
        alter_id: &str,
        subsystem_id: Option<&str>,
    ) -> Result<()> {
        let start = Instant::now();
        let mut tx = self.pool.begin().await?;
        // Remove existing memberships
        sqlx::query("DELETE FROM alter_subsystems WHERE alter_id=?1")
            .bind(alter_id)
            .execute(&mut *tx)
            .await?;

        // If a new subsystem is provided, insert it (ignore duplicates)
        if let Some(sid) = subsystem_id {
            sqlx::query(
                "INSERT OR IGNORE INTO alter_subsystems (alter_id, subsystem_id) VALUES (?1, ?2)",
            )
            .bind(alter_id)
            .bind(sid)
            .execute(&mut *tx)
            .await?;
        }

        tx.commit().await?;
        record_db_operation("set_membership", "subsystems", "success", start.elapsed());
        Ok(())
    }
}
