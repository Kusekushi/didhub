use crate::common::CommonOperations;
use crate::models::Alter;
use crate::types::CurrentUser;
use crate::Db;
use anyhow::Result;
use async_trait::async_trait;

#[async_trait]
pub trait AlterOperations: Send + Sync {
    async fn create_alter(&self, na: &serde_json::Value) -> Result<Alter>;
    async fn fetch_alter(&self, id: i64) -> Result<Option<Alter>>;
    async fn delete_alter(&self, id: i64) -> Result<bool>;
    async fn list_alters(&self, q: Option<String>, limit: i64, offset: i64) -> Result<Vec<Alter>>;
    async fn count_alters(&self, q: Option<String>) -> Result<i64>;
    async fn list_alters_by_user(
        &self,
        q: Option<String>,
        limit: i64,
        offset: i64,
        user_id: i64,
    ) -> Result<Vec<Alter>>;
    async fn count_alters_by_user(&self, q: Option<String>, user_id: i64) -> Result<i64>;
    async fn list_alters_scoped(
        &self,
        q: Option<String>,
        limit: i64,
        offset: i64,
        user: &CurrentUser,
        filter_user_id: Option<i64>,
    ) -> Result<Vec<Alter>>;
    async fn count_alters_scoped(
        &self,
        q: Option<String>,
        user: &CurrentUser,
        filter_user_id: Option<i64>,
    ) -> Result<i64>;
    async fn update_alter_fields(&self, id: i64, body: &serde_json::Value)
        -> Result<Option<Alter>>;
    async fn upcoming_birthdays(&self, days_ahead: i64) -> Result<Vec<Alter>>;
    async fn batch_load_relationships(
        &self,
        alter_ids: &[i64],
    ) -> Result<std::collections::HashMap<i64, (Vec<i64>, Vec<i64>, Vec<i64>, Vec<i64>)>>;
}

#[async_trait]
impl AlterOperations for Db {
    async fn create_alter(&self, na: &serde_json::Value) -> Result<Alter> {
        // Expect at minimum name
        let name = na
            .get("name")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim()
            .to_string();
        if name.is_empty() {
            anyhow::bail!("name required");
        }
        let owner_user_id = na.get("owner_user_id").and_then(|v| v.as_i64());
        let nm = name.clone();
        let owner = owner_user_id;
        let rec = self
            .insert_and_return(
                || async {
                    let r = sqlx::query_as::<_, Alter>(
                        "INSERT INTO alters (name, owner_user_id) VALUES (?1, ?2) RETURNING *",
                    )
                    .bind(&nm)
                    .bind(owner)
                    .fetch_one(&self.pool)
                    .await?;
                    Ok(r)
                },
                || async {
                    sqlx::query("INSERT INTO alters (name, owner_user_id) VALUES (?1, ?2)")
                        .bind(&nm)
                        .bind(owner)
                        .execute(&self.pool)
                        .await?;
                    let r = sqlx::query_as::<_, Alter>(
                        "SELECT * FROM alters WHERE id = LAST_INSERT_ID()",
                    )
                    .fetch_one(&self.pool)
                    .await?;
                    Ok(r)
                },
            )
            .await?;
        Ok(rec)
    }

    async fn fetch_alter(&self, id: i64) -> Result<Option<Alter>> {
        let rec = sqlx::query_as::<_, Alter>("SELECT * FROM alters WHERE id=?1")
            .bind(id)
            .fetch_optional(&self.pool)
            .await?;
        Ok(rec)
    }

    async fn delete_alter(&self, id: i64) -> Result<bool> {
        let res = sqlx::query("DELETE FROM alters WHERE id=?1")
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(res.rows_affected() > 0)
    }

    async fn list_alters(&self, q: Option<String>, limit: i64, offset: i64) -> Result<Vec<Alter>> {
        let rows = if let Some(qs) = q {
            let like = format!("%{}%", qs);
            sqlx::query_as::<_, Alter>(
                "SELECT * FROM alters WHERE name LIKE ?1 ORDER BY id ASC LIMIT ?2 OFFSET ?3",
            )
            .bind(like)
            .bind(limit)
            .bind(offset)
            .fetch_all(&self.pool)
            .await?
        } else {
            sqlx::query_as::<_, Alter>("SELECT * FROM alters ORDER BY id ASC LIMIT ?1 OFFSET ?2")
                .bind(limit)
                .bind(offset)
                .fetch_all(&self.pool)
                .await?
        };
        Ok(rows)
    }

    async fn count_alters(&self, q: Option<String>) -> Result<i64> {
        if let Some(qs) = q {
            let like = format!("%{}%", qs);
            let row: (i64,) = sqlx::query_as("SELECT count(*) as c FROM alters WHERE name LIKE ?1")
                .bind(like)
                .fetch_one(&self.pool)
                .await?;
            Ok(row.0)
        } else {
            let row: (i64,) = sqlx::query_as("SELECT count(*) as c FROM alters")
                .fetch_one(&self.pool)
                .await?;
            Ok(row.0)
        }
    }

    async fn list_alters_by_user(
        &self,
        q: Option<String>,
        limit: i64,
        offset: i64,
        user_id: i64,
    ) -> Result<Vec<Alter>> {
        let rows = if let Some(qs) = q {
            let like = format!("%{}%", qs);
            sqlx::query_as::<_, Alter>(
                "SELECT * FROM alters WHERE owner_user_id = ?1 AND name LIKE ?2 ORDER BY id ASC LIMIT ?3 OFFSET ?4",
            )
            .bind(user_id)
            .bind(like)
            .bind(limit)
            .bind(offset)
            .fetch_all(&self.pool)
            .await?
        } else {
            sqlx::query_as::<_, Alter>(
                "SELECT * FROM alters WHERE owner_user_id = ?1 ORDER BY id ASC LIMIT ?2 OFFSET ?3",
            )
            .bind(user_id)
            .bind(limit)
            .bind(offset)
            .fetch_all(&self.pool)
            .await?
        };
        Ok(rows)
    }

    async fn count_alters_by_user(&self, q: Option<String>, user_id: i64) -> Result<i64> {
        if let Some(qs) = q {
            let like = format!("%{}%", qs);
            let row: (i64,) = sqlx::query_as(
                "SELECT count(*) as c FROM alters WHERE owner_user_id = ?1 AND name LIKE ?2",
            )
            .bind(user_id)
            .bind(like)
            .fetch_one(&self.pool)
            .await?;
            Ok(row.0)
        } else {
            let row: (i64,) =
                sqlx::query_as("SELECT count(*) as c FROM alters WHERE owner_user_id = ?1")
                    .bind(user_id)
                    .fetch_one(&self.pool)
                    .await?;
            Ok(row.0)
        }
    }

    async fn list_alters_scoped(
        &self,
        q: Option<String>,
        limit: i64,
        offset: i64,
        user: &CurrentUser,
        filter_user_id: Option<i64>,
    ) -> Result<Vec<Alter>> {
        // If filtering by a specific user_id, allow it (admins can see any, non-admins can see others when explicitly requested)
        if let Some(uid) = filter_user_id {
            return self.list_alters_by_user(q, limit, offset, uid).await;
        }

        // No specific user filter - show scoped results based on user permissions
        if user.is_admin || user.is_system {
            return self.list_alters(q, limit, offset).await;
        }

        // For non-admin users with no filter, show their own alters plus global alters
        let (sql_base, _bind_like_first) = if user.is_approved {
            ("(owner_user_id=?1 OR owner_user_id IS NULL)", false)
        } else {
            // unapproved: only owned
            ("owner_user_id=?1", false)
        };
        let rows = if let Some(qs) = q {
            let like = format!("%{}%", qs);
            let sql = format!(
                "SELECT * FROM alters WHERE {} AND name LIKE ?2 ORDER BY id ASC LIMIT ?3 OFFSET ?4",
                sql_base
            );
            sqlx::query_as::<_, Alter>(&sql)
                .bind(user.id)
                .bind(like)
                .bind(limit)
                .bind(offset)
                .fetch_all(&self.pool)
                .await?
        } else {
            let sql = format!(
                "SELECT * FROM alters WHERE {} ORDER BY id ASC LIMIT ?2 OFFSET ?3",
                sql_base
            );
            sqlx::query_as::<_, Alter>(&sql)
                .bind(user.id)
                .bind(limit)
                .bind(offset)
                .fetch_all(&self.pool)
                .await?
        };
        Ok(rows)
    }

    async fn count_alters_scoped(
        &self,
        q: Option<String>,
        user: &CurrentUser,
        filter_user_id: Option<i64>,
    ) -> Result<i64> {
        // If filtering by a specific user_id, allow it
        if let Some(uid) = filter_user_id {
            return self.count_alters_by_user(q, uid).await;
        }

        // No specific user filter - count scoped results based on user permissions
        if user.is_admin || user.is_system {
            return self.count_alters(q).await;
        }

        // For non-admin users with no filter, count their own alters plus global alters
        let sql_base = if user.is_approved {
            "(owner_user_id=?1 OR owner_user_id IS NULL)"
        } else {
            "owner_user_id=?1"
        };
        if let Some(qs) = q {
            let like = format!("%{}%", qs);
            let sql = format!(
                "SELECT count(*) as c FROM alters WHERE {} AND name LIKE ?2",
                sql_base
            );
            let row: (i64,) = sqlx::query_as(&sql)
                .bind(user.id)
                .bind(like)
                .fetch_one(&self.pool)
                .await?;
            Ok(row.0)
        } else {
            let sql = format!("SELECT count(*) as c FROM alters WHERE {}", sql_base);
            let row: (i64,) = sqlx::query_as(&sql)
                .bind(user.id)
                .fetch_one(&self.pool)
                .await?;
            Ok(row.0)
        }
    }

    async fn update_alter_fields(
        &self,
        id: i64,
        body: &serde_json::Value,
    ) -> Result<Option<Alter>> {
        let mut sets: Vec<String> = Vec::new();
        let mut vals: Vec<(i32, String, serde_json::Value)> = Vec::new();
        let mut idx = 1;
        let mut bind_field = |key: &str| {
            if let Some(v) = body.get(key) {
                sets.push(format!("{}=?{}", key, idx));
                vals.push((idx, key.to_string(), v.clone()));
                idx += 1;
            }
        };
        for k in [
            "name",
            "description",
            "age",
            "gender",
            "pronouns",
            "birthday",
            "sexuality",
            "species",
            "alter_type",
            "job",
            "weapon",
            "triggers",
            "metadata",
            "soul_songs",
            "interests",
            "notes",
            "images",
            "subsystem",
            "system_roles",
            "is_system_host",
            "is_dormant",
            "is_merged",
            "owner_user_id",
        ]
        .iter()
        {
            bind_field(k);
        }
        if sets.is_empty() {
            return self.fetch_alter(id).await;
        }
        let sql = format!("UPDATE alters SET {} WHERE id=?{}", sets.join(","), idx);
        let mut q = sqlx::query(&sql);
        vals.sort_by_key(|(i, _, _)| *i);
        for (_, key, value) in vals {
            use serde_json::Value;

            q = match key.as_str() {
                "owner_user_id" => match value {
                    Value::Number(n) => {
                        if let Some(i) = n.as_i64() {
                            q.bind(i)
                        } else {
                            q.bind(n.to_string())
                        }
                    }
                    Value::Null => q.bind::<Option<i64>>(None),
                    Value::String(s) => {
                        if let Ok(parsed) = s.trim().parse::<i64>() {
                            q.bind(parsed)
                        } else if s.trim().is_empty() {
                            q.bind::<Option<i64>>(None)
                        } else {
                            q.bind(s)
                        }
                    }
                    Value::Bool(b) => q.bind(if b { 1 } else { 0 }),
                    other => q.bind(other.to_string()),
                },
                "is_system_host" | "is_dormant" | "is_merged" => match value {
                    Value::Bool(b) => q.bind(if b { 1 } else { 0 }),
                    Value::Number(n) => {
                        if let Some(i) = n.as_i64() {
                            q.bind(i)
                        } else {
                            q.bind(n.to_string())
                        }
                    }
                    Value::Null => q.bind::<Option<i64>>(None),
                    Value::String(s) => {
                        if let Ok(parsed) = s.trim().parse::<i64>() {
                            q.bind(parsed)
                        } else if s.trim().is_empty() {
                            q.bind::<Option<i64>>(None)
                        } else {
                            q.bind(s)
                        }
                    }
                    other => q.bind(other.to_string()),
                },
                _ => match value {
                    Value::String(s) => q.bind(s),
                    Value::Number(n) => {
                        if let Some(i) = n.as_i64() {
                            q.bind(i)
                        } else if let Some(f) = n.as_f64() {
                            q.bind(f)
                        } else {
                            q.bind(n.to_string())
                        }
                    }
                    Value::Bool(b) => q.bind(if b { 1 } else { 0 }),
                    Value::Null => q.bind::<Option<String>>(None),
                    other => q.bind(other.to_string()),
                },
            };
        }
        q = q.bind(id);
        q.execute(&self.pool).await?;
        self.fetch_alter(id).await
    }

    async fn upcoming_birthdays(&self, days_ahead: i64) -> Result<Vec<Alter>> {
        use chrono::Datelike;
        let today = chrono::Utc::now().date_naive();
        let mut out: Vec<Alter> = Vec::new();
        for offset in 0..=days_ahead {
            let target = today + chrono::Duration::days(offset);
            let md = format!("-%{:02}-{:02}", target.month(), target.day());
            let like_pattern = format!("%{}", md);
            let mmdd = format!("{:02}-{:02}", target.month(), target.day());
            let rows = sqlx::query_as::<_, Alter>(
                "SELECT * FROM alters WHERE birthday LIKE ?1 OR birthday=?2",
            )
            .bind(&like_pattern)
            .bind(&mmdd)
            .fetch_all(&self.pool)
            .await?;
            for r in rows {
                if !out.iter().any(|a| a.id == r.id) {
                    out.push(r);
                }
            }
        }
        Ok(out)
    }

    async fn batch_load_relationships(
        &self,
        alter_ids: &[i64],
    ) -> Result<std::collections::HashMap<i64, (Vec<i64>, Vec<i64>, Vec<i64>, Vec<i64>)>> {
        use std::collections::HashMap;

        if alter_ids.is_empty() {
            return Ok(HashMap::new());
        }

        // Create placeholders for IN clause
        let placeholders: Vec<String> = (0..alter_ids.len())
            .map(|i| format!("?{}", i + 1))
            .collect();
        let placeholders_str = placeholders.join(",");

        // Batch query all partners
        let partners_query = format!("SELECT alter_id, partner_alter_id FROM alter_partners WHERE alter_id IN ({}) OR partner_alter_id IN ({})", placeholders_str, placeholders_str);
        let mut partners_query = sqlx::query_as::<_, (i64, i64)>(&partners_query);
        for id in alter_ids {
            partners_query = partners_query.bind(id);
        }
        for id in alter_ids {
            partners_query = partners_query.bind(id);
        }
        let partners_rows = partners_query.fetch_all(&self.pool).await?;

        // Batch query all parents
        let parents_query = format!(
            "SELECT alter_id, parent_alter_id FROM alter_parents WHERE alter_id IN ({})",
            placeholders_str
        );
        let mut parents_query = sqlx::query_as::<_, (i64, i64)>(&parents_query);
        for id in alter_ids {
            parents_query = parents_query.bind(id);
        }
        let parents_rows = parents_query.fetch_all(&self.pool).await?;

        // Batch query all children
        let children_query = format!(
            "SELECT alter_id, parent_alter_id FROM alter_parents WHERE parent_alter_id IN ({})",
            placeholders_str
        );
        let mut children_query = sqlx::query_as::<_, (i64, i64)>(&children_query);
        for id in alter_ids {
            children_query = children_query.bind(id);
        }
        let children_rows = children_query.fetch_all(&self.pool).await?;

        // Batch query all affiliations
        let affiliations_query = format!(
            "SELECT alter_id, affiliation_id FROM alter_affiliations WHERE alter_id IN ({})",
            placeholders_str
        );
        let mut affiliations_query = sqlx::query_as::<_, (i64, i64)>(&affiliations_query);
        for id in alter_ids {
            affiliations_query = affiliations_query.bind(id);
        }
        let affiliations_rows = affiliations_query.fetch_all(&self.pool).await?;

        // Build the result map
        let mut result: HashMap<i64, (Vec<i64>, Vec<i64>, Vec<i64>, Vec<i64>)> = HashMap::new();
        for &id in alter_ids {
            result.insert(id, (Vec::new(), Vec::new(), Vec::new(), Vec::new()));
        }

        // Process partners (bidirectional)
        for (a, b) in partners_rows {
            for &id in alter_ids {
                if a == id {
                    if let Some((partners, _, _, _)) = result.get_mut(&id) {
                        partners.push(b);
                    }
                } else if b == id {
                    if let Some((partners, _, _, _)) = result.get_mut(&id) {
                        partners.push(a);
                    }
                }
            }
        }

        // Process parents
        for (alter_id, parent_id) in parents_rows {
            if let Some((_, parents, _, _)) = result.get_mut(&alter_id) {
                parents.push(parent_id);
            }
        }

        // Process children
        for (child_id, parent_id) in children_rows {
            if let Some((_, _, children, _)) = result.get_mut(&parent_id) {
                children.push(child_id);
            }
        }

        // Process affiliations
        for (alter_id, affiliation_id) in affiliations_rows {
            if let Some((_, _, _, affiliations)) = result.get_mut(&alter_id) {
                affiliations.push(affiliation_id);
            }
        }

        // Sort and dedup
        for (_, (partners, parents, children, affiliations)) in result.iter_mut() {
            partners.sort();
            partners.dedup();
            parents.sort();
            parents.dedup();
            children.sort();
            children.dedup();
            affiliations.sort();
            affiliations.dedup();
        }

        Ok(result)
    }
}
