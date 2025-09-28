use crate::DbBackend;
use crate::models::{Db, Subsystem};
use crate::entity_ops::{update_entity, delete_entity};
use anyhow::Result;
use async_trait::async_trait;

#[async_trait]
pub trait SubsystemOperations {
    /// Create a new subsystem
    async fn create_subsystem(
        &self,
        name: &str,
        description: Option<&str>,
        leaders: &[i64],
        metadata: Option<&str>,
        owner_user_id: Option<i64>,
    ) -> Result<Subsystem>;

    /// Fetch a subsystem by ID
    async fn fetch_subsystem(&self, id: i64) -> Result<Option<Subsystem>>;

    /// List subsystems with optional search and pagination
    async fn list_subsystems(
        &self,
        q: Option<String>,
        limit: i64,
        offset: i64,
        owner_user_id: Option<i64>,
    ) -> Result<Vec<Subsystem>>;

    /// Count subsystems with optional search
    async fn count_subsystems(&self, q: Option<String>, owner_user_id: Option<i64>) -> Result<i64>;

    /// Update a subsystem
    async fn update_subsystem(
        &self,
        id: i64,
        body: &serde_json::Value,
    ) -> Result<Option<Subsystem>>;

    /// Delete a subsystem
    async fn delete_subsystem(&self, id: i64) -> Result<bool>;

    /// Add an alter to a subsystem
    async fn add_alter_to_subsystem(&self, alter_id: i64, subsystem_id: i64) -> Result<()>;

    /// Remove an alter from a subsystem
    async fn remove_alter_from_subsystem(&self, alter_id: i64, subsystem_id: i64) -> Result<()>;

    /// List all alters in a subsystem
    async fn list_alters_in_subsystem(&self, subsystem_id: i64) -> Result<Vec<i64>>;

    /// Batch load members for multiple subsystems
    async fn batch_load_subsystem_members(&self, subsystem_ids: &[i64]) -> Result<std::collections::HashMap<i64, Vec<i64>>>;
}

#[async_trait]
impl SubsystemOperations for Db {
    async fn create_subsystem(
        &self,
        name: &str,
        description: Option<&str>,
        leaders: &[i64],
        metadata: Option<&str>,
        owner_user_id: Option<i64>,
    ) -> Result<Subsystem> {
        if name.trim().is_empty() {
            anyhow::bail!("name required");
        }
        let leaders_json = if leaders.is_empty() {
            None
        } else {
            Some(serde_json::to_string(leaders).unwrap())
        };
        let rec = match self.backend {
            DbBackend::Sqlite => {
                sqlx::query_as::<_, Subsystem>("INSERT INTO subsystems (name, description, leaders, metadata, owner_user_id) VALUES (?1, ?2, ?3, ?4, ?5) RETURNING id, name, description, leaders, metadata, owner_user_id, CAST(created_at AS TEXT) as created_at")
                    .bind(name)
                    .bind(description)
                    .bind(leaders_json)
                    .bind(metadata)
                    .bind(owner_user_id)
                    .fetch_one(&self.pool).await?
            }
            DbBackend::Postgres => {
                sqlx::query_as::<_, Subsystem>("INSERT INTO subsystems (name, description, leaders, metadata, owner_user_id) VALUES ($1, $2, $3, $4, $5) RETURNING *")
                    .bind(name)
                    .bind(description)
                    .bind(leaders_json)
                    .bind(metadata)
                    .bind(owner_user_id)
                    .fetch_one(&self.pool).await?
            }
            DbBackend::MySql => {
                sqlx::query("INSERT INTO subsystems (name, description, leaders, metadata, owner_user_id) VALUES (?1, ?2, ?3, ?4, ?5)")
                    .bind(name)
                    .bind(description)
                    .bind(leaders_json)
                    .bind(metadata)
                    .bind(owner_user_id)
                    .execute(&self.pool).await?;
                sqlx::query_as::<_, Subsystem>("SELECT id, name, description, leaders, metadata, owner_user_id, created_at FROM subsystems WHERE id = LAST_INSERT_ID()")
                    .fetch_one(&self.pool).await?
            }
        };
        Ok(rec)
    }

    async fn fetch_subsystem(&self, id: i64) -> Result<Option<Subsystem>> {
        match self.backend {
            DbBackend::Sqlite => {
                Ok(sqlx::query_as::<_, Subsystem>("SELECT id, name, description, leaders, metadata, owner_user_id, CAST(created_at AS TEXT) as created_at FROM subsystems WHERE id=?1").bind(id).fetch_optional(&self.pool).await?)
            }
            _ => Ok(sqlx::query_as::<_, Subsystem>("SELECT * FROM subsystems WHERE id=?1").bind(id).fetch_optional(&self.pool).await?),
        }
    }

    async fn list_subsystems(
        &self,
        q: Option<String>,
        limit: i64,
        offset: i64,
        owner_user_id: Option<i64>,
    ) -> Result<Vec<Subsystem>> {
        let rows = match (q, owner_user_id) {
            (Some(qs), Some(owner_id)) => {
                let like = format!("%{}%", qs);
                match self.backend {
                    DbBackend::Sqlite => sqlx::query_as::<_, Subsystem>("SELECT id, name, description, leaders, metadata, owner_user_id, CAST(created_at AS TEXT) as created_at FROM subsystems WHERE name LIKE ?1 AND owner_user_id = ?2 ORDER BY id DESC LIMIT ?3 OFFSET ?4").bind(like).bind(owner_id).bind(limit).bind(offset).fetch_all(&self.pool).await?,
                    _ => sqlx::query_as::<_, Subsystem>("SELECT * FROM subsystems WHERE name LIKE ?1 AND owner_user_id = ?2 ORDER BY id DESC LIMIT ?3 OFFSET ?4").bind(like).bind(owner_id).bind(limit).bind(offset).fetch_all(&self.pool).await?,
                }
            },
            (Some(qs), None) => {
                let like = format!("%{}%", qs);
                match self.backend {
                    DbBackend::Sqlite => sqlx::query_as::<_, Subsystem>("SELECT id, name, description, leaders, metadata, owner_user_id, CAST(created_at AS TEXT) as created_at FROM subsystems WHERE name LIKE ?1 ORDER BY id DESC LIMIT ?2 OFFSET ?3").bind(like).bind(limit).bind(offset).fetch_all(&self.pool).await?,
                    _ => sqlx::query_as::<_, Subsystem>("SELECT * FROM subsystems WHERE name LIKE ?1 ORDER BY id DESC LIMIT ?2 OFFSET ?3").bind(like).bind(limit).bind(offset).fetch_all(&self.pool).await?,
                }
            },
            (None, Some(owner_id)) => {
                match self.backend {
                    DbBackend::Sqlite => sqlx::query_as::<_, Subsystem>("SELECT id, name, description, leaders, metadata, owner_user_id, CAST(created_at AS TEXT) as created_at FROM subsystems WHERE owner_user_id = ?1 ORDER BY id DESC LIMIT ?2 OFFSET ?3").bind(owner_id).bind(limit).bind(offset).fetch_all(&self.pool).await?,
                    _ => sqlx::query_as::<_, Subsystem>("SELECT * FROM subsystems WHERE owner_user_id = ?1 ORDER BY id DESC LIMIT ?2 OFFSET ?3").bind(owner_id).bind(limit).bind(offset).fetch_all(&self.pool).await?,
                }
            },
            (None, None) => {
                match self.backend {
                    DbBackend::Sqlite => sqlx::query_as::<_, Subsystem>("SELECT id, name, description, leaders, metadata, owner_user_id, CAST(created_at AS TEXT) as created_at FROM subsystems ORDER BY id DESC LIMIT ?1 OFFSET ?2").bind(limit).bind(offset).fetch_all(&self.pool).await?,
                    _ => sqlx::query_as::<_, Subsystem>("SELECT * FROM subsystems ORDER BY id DESC LIMIT ?1 OFFSET ?2").bind(limit).bind(offset).fetch_all(&self.pool).await?,
                }
            },
        };
        Ok(rows)
    }

    async fn count_subsystems(&self, q: Option<String>, owner_user_id: Option<i64>) -> Result<i64> {
        match (q, owner_user_id) {
            (Some(qs), Some(owner_id)) => {
                let like = format!("%{}%", qs);
                let (c,): (i64,) = sqlx::query_as("SELECT count(*) FROM subsystems WHERE name LIKE ?1 AND owner_user_id = ?2")
                    .bind(like)
                    .bind(owner_id)
                    .fetch_one(&self.pool)
                    .await?;
                Ok(c)
            },
            (Some(qs), None) => {
                let like = format!("%{}%", qs);
                let (c,): (i64,) = sqlx::query_as("SELECT count(*) FROM subsystems WHERE name LIKE ?1")
                    .bind(like)
                    .fetch_one(&self.pool)
                    .await?;
                Ok(c)
            },
            (None, Some(owner_id)) => {
                let (c,): (i64,) = sqlx::query_as("SELECT count(*) FROM subsystems WHERE owner_user_id = ?1")
                    .bind(owner_id)
                    .fetch_one(&self.pool)
                    .await?;
                Ok(c)
            },
            (None, None) => {
                let (c,): (i64,) = sqlx::query_as("SELECT count(*) FROM subsystems")
                    .fetch_one(&self.pool)
                    .await?;
                Ok(c)
            }
        }
    }

    async fn update_subsystem(
        &self,
        id: i64,
        body: &serde_json::Value,
    ) -> Result<Option<Subsystem>> {
        if body.as_object().map(|m| m.is_empty()).unwrap_or(true) {
            return self.fetch_subsystem(id).await;
        }
        update_entity(self, "subsystems", id, body, &["name", "description", "leaders", "metadata", "owner_user_id"]).await?;
        self.fetch_subsystem(id).await
    }

    async fn delete_subsystem(&self, id: i64) -> Result<bool> {
        delete_entity(self, "subsystems", id).await
    }

    async fn add_alter_to_subsystem(&self, alter_id: i64, subsystem_id: i64) -> Result<()> {
        sqlx::query(
            "INSERT OR IGNORE INTO alter_subsystems (alter_id, subsystem_id) VALUES (?1, ?2)",
        )
        .bind(alter_id)
        .bind(subsystem_id)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    async fn remove_alter_from_subsystem(&self, alter_id: i64, subsystem_id: i64) -> Result<()> {
        sqlx::query("DELETE FROM alter_subsystems WHERE alter_id=?1 AND subsystem_id=?2")
            .bind(alter_id)
            .bind(subsystem_id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    async fn list_alters_in_subsystem(&self, subsystem_id: i64) -> Result<Vec<i64>> {
        let rows = sqlx::query_as::<_, (i64,)>(
            "SELECT alter_id FROM alter_subsystems WHERE subsystem_id=?1",
        )
        .bind(subsystem_id)
        .fetch_all(&self.pool)
        .await?;
        Ok(rows.into_iter().map(|r| r.0).collect())
    }

    async fn batch_load_subsystem_members(&self, subsystem_ids: &[i64]) -> Result<std::collections::HashMap<i64, Vec<i64>>> {
        use std::collections::HashMap;

        if subsystem_ids.is_empty() {
            return Ok(HashMap::new());
        }

        // Create placeholders for IN clause
        let placeholders: Vec<String> = (0..subsystem_ids.len()).map(|i| format!("?{}", i + 1)).collect();
        let placeholders_str = placeholders.join(",");

        // Batch query all subsystem members
        let query = format!(
            "SELECT subsystem_id, alter_id FROM alter_subsystems WHERE subsystem_id IN ({})",
            placeholders_str
        );
        let mut q = sqlx::query_as::<_, (i64, i64)>(&query);
        for id in subsystem_ids {
            q = q.bind(id);
        }
        let rows = q.fetch_all(&self.pool).await?;

        // Build the result map
        let mut result: HashMap<i64, Vec<i64>> = HashMap::new();
        for &id in subsystem_ids {
            result.insert(id, Vec::new());
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

        Ok(result)
    }
}