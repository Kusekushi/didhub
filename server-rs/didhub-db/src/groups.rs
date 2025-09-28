use crate::entity_ops::{delete_entity, update_entity};
use crate::models::{Db, Group};
use crate::DbBackend;
use anyhow::Result;
use async_trait::async_trait;

#[async_trait]
pub trait GroupOperations {
    /// Create a new group
    async fn create_group(
        &self,
        name: &str,
        description: Option<&str>,
        sigil: Option<&str>,
        leaders: &[i64],
        metadata: Option<&str>,
        owner_user_id: Option<i64>,
    ) -> Result<Group>;

    /// Fetch a group by ID
    async fn fetch_group(&self, id: i64) -> Result<Option<Group>>;

    /// List groups with optional search and pagination
    async fn list_groups(&self, q: Option<String>, limit: i64, offset: i64) -> Result<Vec<Group>>;

    /// List groups owned by a specific user with optional search and pagination
    async fn list_groups_by_owner(
        &self,
        owner_user_id: i64,
        q: Option<String>,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<Group>>;

    /// Count groups with optional search
    async fn count_groups(&self, q: Option<String>) -> Result<i64>;

    /// Count groups owned by a specific user with optional search
    async fn count_groups_by_owner(&self, owner_user_id: i64, q: Option<String>) -> Result<i64>;

    /// Update a group
    async fn update_group(&self, id: i64, body: &serde_json::Value) -> Result<Option<Group>>;

    /// Delete a group
    async fn delete_group(&self, id: i64) -> Result<bool>;

    /// Batch load members for multiple groups
    async fn batch_load_group_members(
        &self,
        group_ids: &[i64],
    ) -> Result<std::collections::HashMap<i64, Vec<i64>>>;
}

#[async_trait]
impl GroupOperations for Db {
    async fn create_group(
        &self,
        name: &str,
        description: Option<&str>,
        sigil: Option<&str>,
        leaders: &[i64],
        metadata: Option<&str>,
        owner_user_id: Option<i64>,
    ) -> Result<Group> {
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
                sqlx::query_as::<_, Group>("INSERT INTO groups (name, description, sigil, leaders, metadata, owner_user_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6) RETURNING id, name, description, sigil, leaders, metadata, owner_user_id, CAST(created_at AS TEXT) as created_at")
                    .bind(name)
                    .bind(description)
                    .bind(sigil)
                    .bind(leaders_json)
                    .bind(metadata)
                    .bind(owner_user_id)
                    .fetch_one(&self.pool).await?
            }
            DbBackend::Postgres => {
                sqlx::query_as::<_, Group>("INSERT INTO groups (name, description, sigil, leaders, metadata, owner_user_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *")
                    .bind(name)
                    .bind(description)
                    .bind(sigil)
                    .bind(leaders_json)
                    .bind(metadata)
                    .bind(owner_user_id)
                    .fetch_one(&self.pool).await?
            }
            DbBackend::MySql => {
                // MySQL: insert then fetch by LAST_INSERT_ID()
                sqlx::query("INSERT INTO groups (name, description, sigil, leaders, metadata, owner_user_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6)")
                    .bind(name)
                    .bind(description)
                    .bind(sigil)
                    .bind(leaders_json)
                    .bind(metadata)
                    .bind(owner_user_id)
                    .execute(&self.pool).await?;
                sqlx::query_as::<_, Group>("SELECT id, name, description, sigil, leaders, metadata, owner_user_id, created_at FROM groups WHERE id = LAST_INSERT_ID()")
                    .fetch_one(&self.pool).await?
            }
        };
        Ok(rec)
    }

    async fn fetch_group(&self, id: i64) -> Result<Option<Group>> {
        match self.backend {
            DbBackend::Sqlite => Ok(sqlx::query_as::<_, Group>("SELECT id, name, description, sigil, leaders, metadata, owner_user_id, CAST(created_at AS TEXT) as created_at FROM groups WHERE id=?1").bind(id).fetch_optional(&self.pool).await?),
            _ => Ok(sqlx::query_as::<_, Group>("SELECT * FROM groups WHERE id=?1").bind(id).fetch_optional(&self.pool).await?),
        }
    }

    async fn list_groups(&self, q: Option<String>, limit: i64, offset: i64) -> Result<Vec<Group>> {
        let rows = if let Some(qs) = q {
            let like = format!("%{}%", qs);
            match self.backend {
                DbBackend::Sqlite => sqlx::query_as::<_, Group>("SELECT id, name, description, sigil, leaders, metadata, owner_user_id, CAST(created_at AS TEXT) as created_at FROM groups WHERE name LIKE ?1 ORDER BY id DESC LIMIT ?2 OFFSET ?3").bind(like).bind(limit).bind(offset).fetch_all(&self.pool).await?,
                _ => sqlx::query_as::<_, Group>("SELECT * FROM groups WHERE name LIKE ?1 ORDER BY id DESC LIMIT ?2 OFFSET ?3").bind(like).bind(limit).bind(offset).fetch_all(&self.pool).await?,
            }
        } else {
            match self.backend {
                DbBackend::Sqlite => sqlx::query_as::<_, Group>("SELECT id, name, description, sigil, leaders, metadata, owner_user_id, CAST(created_at AS TEXT) as created_at FROM groups ORDER BY id DESC LIMIT ?1 OFFSET ?2").bind(limit).bind(offset).fetch_all(&self.pool).await?,
                _ => sqlx::query_as::<_, Group>("SELECT * FROM groups ORDER BY id DESC LIMIT ?1 OFFSET ?2").bind(limit).bind(offset).fetch_all(&self.pool).await?,
            }
        };
        Ok(rows)
    }

    async fn list_groups_by_owner(
        &self,
        owner_user_id: i64,
        q: Option<String>,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<Group>> {
        let rows = if let Some(qs) = q {
            let like = format!("%{}%", qs);
            match self.backend {
                DbBackend::Sqlite => sqlx::query_as::<_, Group>("SELECT id, name, description, sigil, leaders, metadata, owner_user_id, CAST(created_at AS TEXT) as created_at FROM groups WHERE owner_user_id = ?1 AND name LIKE ?2 ORDER BY id DESC LIMIT ?3 OFFSET ?4").bind(owner_user_id).bind(like).bind(limit).bind(offset).fetch_all(&self.pool).await?,
                _ => sqlx::query_as::<_, Group>("SELECT * FROM groups WHERE owner_user_id = ?1 AND name LIKE ?2 ORDER BY id DESC LIMIT ?3 OFFSET ?4").bind(owner_user_id).bind(like).bind(limit).bind(offset).fetch_all(&self.pool).await?,
            }
        } else {
            match self.backend {
                DbBackend::Sqlite => sqlx::query_as::<_, Group>("SELECT id, name, description, sigil, leaders, metadata, owner_user_id, CAST(created_at AS TEXT) as created_at FROM groups WHERE owner_user_id = ?1 ORDER BY id DESC LIMIT ?2 OFFSET ?3").bind(owner_user_id).bind(limit).bind(offset).fetch_all(&self.pool).await?,
                _ => sqlx::query_as::<_, Group>("SELECT * FROM groups WHERE owner_user_id = ?1 ORDER BY id DESC LIMIT ?2 OFFSET ?3").bind(owner_user_id).bind(limit).bind(offset).fetch_all(&self.pool).await?,
            }
        };
        Ok(rows)
    }

    async fn count_groups(&self, q: Option<String>) -> Result<i64> {
        if let Some(qs) = q {
            let like = format!("%{}%", qs);
            let (c,): (i64,) = sqlx::query_as("SELECT count(*) FROM groups WHERE name LIKE ?1")
                .bind(like)
                .fetch_one(&self.pool)
                .await?;
            Ok(c)
        } else {
            let (c,): (i64,) = sqlx::query_as("SELECT count(*) FROM groups")
                .fetch_one(&self.pool)
                .await?;
            Ok(c)
        }
    }

    async fn count_groups_by_owner(&self, owner_user_id: i64, q: Option<String>) -> Result<i64> {
        if let Some(qs) = q {
            let like = format!("%{}%", qs);
            let (c,): (i64,) = sqlx::query_as(
                "SELECT count(*) FROM groups WHERE owner_user_id = ?1 AND name LIKE ?2",
            )
            .bind(owner_user_id)
            .bind(like)
            .fetch_one(&self.pool)
            .await?;
            Ok(c)
        } else {
            let (c,): (i64,) =
                sqlx::query_as("SELECT count(*) FROM groups WHERE owner_user_id = ?1")
                    .bind(owner_user_id)
                    .fetch_one(&self.pool)
                    .await?;
            Ok(c)
        }
    }

    async fn update_group(&self, id: i64, body: &serde_json::Value) -> Result<Option<Group>> {
        if body.as_object().map(|m| m.is_empty()).unwrap_or(true) {
            return self.fetch_group(id).await;
        }
        update_entity(
            self,
            "groups",
            id,
            body,
            &[
                "name",
                "description",
                "sigil",
                "leaders",
                "metadata",
                "owner_user_id",
            ],
        )
        .await?;
        self.fetch_group(id).await
    }

    async fn delete_group(&self, id: i64) -> Result<bool> {
        delete_entity(self, "groups", id).await
    }

    async fn batch_load_group_members(
        &self,
        group_ids: &[i64],
    ) -> Result<std::collections::HashMap<i64, Vec<i64>>> {
        use std::collections::HashMap;

        if group_ids.is_empty() {
            return Ok(HashMap::new());
        }

        // Create placeholders for IN clause
        let placeholders: Vec<String> = (0..group_ids.len())
            .map(|i| format!("?{}", i + 1))
            .collect();
        let placeholders_str = placeholders.join(",");

        // Batch query all group members
        let query = format!(
            "SELECT affiliation_id, alter_id FROM alter_affiliations WHERE affiliation_id IN ({})",
            placeholders_str
        );
        let mut q = sqlx::query_as::<_, (i64, i64)>(&query);
        for id in group_ids {
            q = q.bind(id);
        }
        let rows = q.fetch_all(&self.pool).await?;

        // Build the result map
        let mut result: HashMap<i64, Vec<i64>> = HashMap::new();
        for &id in group_ids {
            result.insert(id, Vec::new());
        }

        // Process members
        for (group_id, alter_id) in rows {
            if let Some(alters) = result.get_mut(&group_id) {
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
