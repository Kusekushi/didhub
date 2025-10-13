use crate::models::*;
use crate::Db;
use anyhow::Result;
use didhub_metrics::record_db_operation;
use std::time::Instant;

/// Typed identifier for person nodes: either a User or an Alter.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum PersonIdentifier {
    User(String),
    Alter(String),
}

impl PersonIdentifier {
    /// Parse a mixed identifier like "U:<uuid>" or "A:<uuid>". If no prefix
    /// is provided we assume it's an Alter id for backward compatibility.
    pub fn from_mixed_str(mixed: &str) -> Self {
        if let Some(rest) = mixed.strip_prefix("U:") {
            PersonIdentifier::User(rest.to_string())
        } else if let Some(rest) = mixed.strip_prefix("A:") {
            PersonIdentifier::Alter(rest.to_string())
        } else {
            PersonIdentifier::Alter(mixed.to_string())
        }
    }

    /// Convenience: return (is_user, &str id)
    fn as_pair(&self) -> (bool, &str) {
        match self {
            PersonIdentifier::User(s) => (true, s.as_str()),
            PersonIdentifier::Alter(s) => (false, s.as_str()),
        }
    }
}

fn insert_ignore_query(backend: crate::DbBackend, table: &str, cols: &[&str]) -> String {
    let cols_str = cols.join(", ");
    let placeholders = (0..cols.len())
        .map(|i| format!("?{}", i + 1))
        .collect::<Vec<_>>()
        .join(", ");
    match backend {
        crate::DbBackend::Sqlite => format!(
            "INSERT OR IGNORE INTO {} ({}) VALUES ({})",
            table, cols_str, placeholders
        ),
        crate::DbBackend::Postgres => format!(
            "INSERT INTO {} ({}) VALUES ({}) ON CONFLICT DO NOTHING",
            table, cols_str, placeholders
        ),
        crate::DbBackend::MySql => format!(
            "INSERT IGNORE INTO {} ({}) VALUES ({})",
            table, cols_str, placeholders
        ),
    }
}

#[async_trait::async_trait]
pub trait AlterRelationships {
    async fn replace_partners(&self, id: &str, partners: &[String]) -> Result<u64>;
    async fn replace_parents(&self, id: &str, parents: &[String]) -> Result<u64>;
    async fn replace_children(&self, id: &str, children: &[String]) -> Result<u64>;
    async fn replace_affiliations(&self, id: &str, affiliations: &[String]) -> Result<u64>;
    async fn partners_of(&self, id: &str) -> Result<Vec<String>>;
    async fn parents_of(&self, id: &str) -> Result<Vec<String>>;
    async fn children_of(&self, id: &str) -> Result<Vec<String>>;
    async fn affiliations_of(&self, id: &str) -> Result<Vec<String>>;
    async fn remove_user_from_group(&self, user_id: &str, group_id: &str) -> Result<bool>;
    async fn add_user_to_group(&self, user_id: &str, group_id: &str) -> Result<bool>;
    async fn prune_orphan_group_members(&self) -> Result<i64>;
    async fn prune_orphan_subsystem_members(&self) -> Result<i64>;
    async fn list_user_groups_scoped(
        &self,
        user_id: &str,
        query: Option<&str>,
    ) -> Result<Vec<Group>>;
    async fn list_alters_in_group(&self, group_id: &str) -> Result<Vec<String>>;
}

#[async_trait::async_trait]
impl AlterRelationships for Db {
    async fn replace_partners(&self, id: &str, partners: &[String]) -> Result<u64> {
        // Forward compatibility: migrate alter-partner pairs into person_relationships
        // Each partner is an alter id; we represent both sides as alters in the
        // unified person_relationships table. We delete existing person_relationships
        // that reference this alter as a spouse (type='spouse') and insert the new set.
        let start = Instant::now();
        // Remove existing spouse relationships for this alter (either side)
        let del_q = "DELETE FROM person_relationships WHERE type = 'spouse' AND (person_a_alter_id = ?1 OR person_b_alter_id = ?1)";
        let mut rows_affected = sqlx::query(del_q).bind(id).execute(&self.pool).await?.rows_affected();
        for p in partners {
            if *p == id {
                continue;
            }
            // generate a UUID for the relationship id
            let rel_id = uuid::Uuid::new_v4().to_string();
            // Insert as alter<->alter spouse relationship. DB triggers will canonicalize.
            rows_affected += self
                .insert_person_relationship(
                    &rel_id,
                    "spouse",
                    None,
                    Some(id),
                    None,
                    Some(p),
                    0,
                    None,
                )
                .await?;
        }
        record_db_operation(
            "replace_partners",
            "person_relationships",
            "success",
            start.elapsed(),
        );
        Ok(rows_affected)
    }

    async fn replace_parents(&self, id: &str, parents: &[String]) -> Result<u64> {
        // Replace parent relationships for an alter by using person_relationships
        let start = Instant::now();
        // Delete existing parent relationships where this alter is the child
        let del_q = "DELETE FROM person_relationships WHERE type = 'parent' AND person_a_alter_id = ?1";
        let mut rows_affected = sqlx::query(del_q).bind(id).execute(&self.pool).await?.rows_affected();
        for p in parents {
            if *p == id {
                continue;
            }
            let rel_id = uuid::Uuid::new_v4().to_string();
            // parent relationship: a = child (this alter), b = parent
            rows_affected += self
                .insert_person_relationship(
                    &rel_id,
                    "parent",
                    None,
                    Some(id),
                    None,
                    Some(p),
                    0,
                    None,
                )
                .await?;
        }
        record_db_operation(
            "replace_parents",
            "person_relationships",
            "success",
            start.elapsed(),
        );
        Ok(rows_affected)
    }

    async fn replace_children(&self, id: &str, children: &[String]) -> Result<u64> {
        // Use unified person_relationships table: when replacing children for a given parent
        // we delete existing parent relationships where person_b_alter_id = parent_id
        // and insert new rows where person_a is the child and person_b is the parent.
        let start = Instant::now();
        let del_q = "DELETE FROM person_relationships WHERE type = 'parent' AND person_b_alter_id = ?1";
        let mut rows_affected = sqlx::query(del_q).bind(id).execute(&self.pool).await?.rows_affected();
        for c in children {
            if *c == id {
                continue;
            }
            let rel_id = uuid::Uuid::new_v4().to_string();
            rows_affected += self
                .insert_person_relationship(
                    &rel_id,
                    "parent",
                    None,
                    Some(c), // child
                    None,
                    Some(id), // parent
                    0,
                    None,
                )
                .await?;
        }
        record_db_operation(
            "replace_children",
            "person_relationships",
            "success",
            start.elapsed(),
        );
        Ok(rows_affected)
    }

    async fn replace_affiliations(&self, id: &str, affiliations: &[String]) -> Result<u64> {
        let start = Instant::now();
        let mut rows_affected = sqlx::query("DELETE FROM alter_affiliations WHERE alter_id=?1")
            .bind(id)
            .execute(&self.pool)
            .await?
            .rows_affected();
        for a in affiliations {
            let q = insert_ignore_query(
                self.backend,
                "alter_affiliations",
                &["affiliation_id", "alter_id"],
            );
            rows_affected += sqlx::query(&q)
                .bind(a)
                .bind(id)
                .execute(&self.pool)
                .await?
                .rows_affected();
        }
        record_db_operation(
            "replace_affiliations",
            "alter_affiliations",
            "success",
            start.elapsed(),
        );
        Ok(rows_affected)
    }

    async fn partners_of(&self, id: &str) -> Result<Vec<String>> {
        let start = Instant::now();
        // Query person_relationships for spouse relationships where this alter is either side
        let rows = sqlx::query_as::<_, PersonRelationship>(
            "SELECT * FROM person_relationships WHERE type = 'spouse' AND (person_a_alter_id = ?1 OR person_b_alter_id = ?1)",
        )
        .bind(id)
        .fetch_all(&self.pool)
        .await?;
        let mut out: Vec<String> = Vec::new();
        for r in rows {
            if r.person_a_alter_id.as_deref() == Some(id) {
                if let Some(b) = r.person_b_alter_id { out.push(b); }
                else if let Some(bu) = r.person_b_user_id { out.push(bu); }
            } else {
                if let Some(a) = r.person_a_alter_id { out.push(a); }
                else if let Some(au) = r.person_a_user_id { out.push(au); }
            }
        }
        out.sort();
        out.dedup();
        record_db_operation("partners_of", "person_relationships", "success", start.elapsed());
        Ok(out)
    }

    async fn parents_of(&self, id: &str) -> Result<Vec<String>> {
        let start = Instant::now();
        // In person_relationships parent rows are stored with person_a as the child and person_b as the parent
        let rows = sqlx::query_as::<_, PersonRelationship>(
            "SELECT * FROM person_relationships WHERE type = 'parent' AND person_a_alter_id = ?1",
        )
        .bind(id)
        .fetch_all(&self.pool)
        .await?;
        let mut out: Vec<String> = Vec::new();
        for r in rows {
            if let Some(pid) = r.person_b_alter_id { out.push(pid); }
            else if let Some(puid) = r.person_b_user_id { out.push(puid); }
        }
        out.sort();
        out.dedup();
        record_db_operation("parents_of", "person_relationships", "success", start.elapsed());
        Ok(out)
    }

    async fn children_of(&self, id: &str) -> Result<Vec<String>> {
        let start = Instant::now();
        // children are person_a when person_b is the parent
        let rows = sqlx::query_as::<_, PersonRelationship>(
            "SELECT * FROM person_relationships WHERE type = 'parent' AND person_b_alter_id = ?1",
        )
        .bind(id)
        .fetch_all(&self.pool)
        .await?;
        let mut out: Vec<String> = Vec::new();
        for r in rows {
            if let Some(cid) = r.person_a_alter_id { out.push(cid); }
            else if let Some(cu) = r.person_a_user_id { out.push(cu); }
        }
        out.sort();
        out.dedup();
        record_db_operation("children_of", "person_relationships", "success", start.elapsed());
        Ok(out)
    }

    async fn affiliations_of(&self, id: &str) -> Result<Vec<String>> {
        let start = Instant::now();
        let rows = sqlx::query_as::<_, (String,)>(
            "SELECT affiliation_id FROM alter_affiliations WHERE alter_id=?1",
        )
        .bind(id)
        .fetch_all(&self.pool)
        .await?;
        let result = rows.into_iter().map(|r| r.0).collect();
        record_db_operation(
            "affiliations_of",
            "alter_affiliations",
            "success",
            start.elapsed(),
        );
        Ok(result)
    }

    async fn list_alters_in_group(&self, group_id: &str) -> Result<Vec<String>> {
        let start = Instant::now();
        let rows = sqlx::query_as::<_, (String,)>(
            "SELECT alter_id FROM alter_affiliations WHERE affiliation_id=?1",
        )
        .bind(group_id)
        .fetch_all(&self.pool)
        .await?;
        let result = rows.into_iter().map(|r| r.0).collect();
        record_db_operation(
            "list_alters_in_group",
            "alter_affiliations",
            "success",
            start.elapsed(),
        );
        Ok(result)
    }

    async fn list_user_groups_scoped(
        &self,
        user_id: &str,
        query: Option<&str>,
    ) -> Result<Vec<Group>> {
        let start = Instant::now();
        let rows = if let Some(q) = query {
            let like = format!("%{}%", q);
            sqlx::query_as::<_, Group>("SELECT g.* FROM groups g JOIN user_group_memberships ugm ON g.id = ugm.group_id WHERE ugm.user_id=?1 AND g.name LIKE ?2 ORDER BY g.name ASC")
                .bind(user_id)
                .bind(like)
                .fetch_all(&self.pool).await?
        } else {
            sqlx::query_as::<_, Group>("SELECT g.* FROM groups g JOIN user_group_memberships ugm ON g.id = ugm.group_id WHERE ugm.user_id=?1 ORDER BY g.name ASC")
                .bind(user_id)
                .fetch_all(&self.pool).await?
        };
        record_db_operation(
            "list_user_groups_scoped",
            "user_group_memberships",
            "success",
            start.elapsed(),
        );
        Ok(rows)
    }

    async fn remove_user_from_group(&self, user_id: &str, group_id: &str) -> Result<bool> {
        let start = Instant::now();
        let res =
            sqlx::query("DELETE FROM user_group_memberships WHERE user_id=?1 AND group_id=?2")
                .bind(user_id)
                .bind(group_id)
                .execute(&self.pool)
                .await?;
        let success = res.rows_affected() > 0;
        record_db_operation(
            "remove_user_from_group",
            "user_group_memberships",
            if success { "success" } else { "not_found" },
            start.elapsed(),
        );
        Ok(success)
    }

    async fn add_user_to_group(&self, user_id: &str, group_id: &str) -> Result<bool> {
        let start = Instant::now();
        let q = insert_ignore_query(
            self.backend,
            "user_group_memberships",
            &["user_id", "group_id"],
        );
        let res = sqlx::query(&q)
            .bind(user_id)
            .bind(group_id)
            .execute(&self.pool)
            .await?;
        let success = res.rows_affected() > 0;
        record_db_operation(
            "add_user_to_group",
            "user_group_memberships",
            if success { "success" } else { "already_member" },
            start.elapsed(),
        );
        Ok(success)
    }

    async fn prune_orphan_group_members(&self) -> Result<i64> {
        let start = Instant::now();
        let res = sqlx::query("DELETE FROM user_group_memberships WHERE user_id NOT IN (SELECT id FROM users) OR group_id NOT IN (SELECT id FROM groups)")
            .execute(&self.pool)
            .await?;
        let rows_affected = res.rows_affected() as i64;
        record_db_operation(
            "prune_orphan_group_members",
            "user_group_memberships",
            "success",
            start.elapsed(),
        );
        Ok(rows_affected)
    }

    async fn prune_orphan_subsystem_members(&self) -> Result<i64> {
        let start = Instant::now();
        let res = sqlx::query("DELETE FROM alter_affiliations WHERE alter_id NOT IN (SELECT id FROM alters) OR affiliation_id NOT IN (SELECT id FROM subsystems)")
            .execute(&self.pool)
            .await?;
        let rows_affected = res.rows_affected() as i64;
        record_db_operation(
            "prune_orphan_subsystem_members",
            "alter_affiliations",
            "success",
            start.elapsed(),
        );
        Ok(rows_affected)
    }
}

// New helpers for person_relationships to support users and alters as nodes
impl Db {

    /// Insert a person relationship using typed `PersonIdentifier` values.
    pub async fn insert_person_relationship_pid(
        &self,
        id: &str,
        rel_type: &str,
        a: PersonIdentifier,
        b: PersonIdentifier,
        is_past_life: i32,
        created_by: Option<&str>,
    ) -> Result<u64> {
        let (a_is_user, a_id) = a.as_pair();
        let (b_is_user, b_id) = b.as_pair();
        let a_user = if a_is_user { Some(a_id) } else { None };
        let a_alter = if a_is_user { None } else { Some(a_id) };
        let b_user = if b_is_user { Some(b_id) } else { None };
        let b_alter = if b_is_user { None } else { Some(b_id) };
        self.insert_person_relationship(id, rel_type, a_user, a_alter, b_user, b_alter, is_past_life, created_by).await
    }

    /// Fetch relationships for a typed `PersonIdentifier`.
    pub async fn relationships_for_pid(&self, pid: PersonIdentifier) -> Result<Vec<PersonRelationship>> {
        let (is_user, id) = pid.as_pair();
        self.relationships_for_entity(id, is_user).await
    }

    // Backwards-compatible string wrappers
    pub async fn insert_person_relationship_mixed(
        &self,
        id: &str,
        rel_type: &str,
        mixed_a: &str,
        mixed_b: &str,
        is_past_life: i32,
        created_by: Option<&str>,
    ) -> Result<u64> {
        let a = PersonIdentifier::from_mixed_str(mixed_a);
        let b = PersonIdentifier::from_mixed_str(mixed_b);
        self.insert_person_relationship_pid(id, rel_type, a, b, is_past_life, created_by).await
    }

    pub async fn relationships_for_mixed(&self, mixed_id: &str) -> Result<Vec<PersonRelationship>> {
        let pid = PersonIdentifier::from_mixed_str(mixed_id);
        self.relationships_for_pid(pid).await
    }
    /// Insert a person relationship. For spouse canonicalization is handled by DB triggers where available.
    pub async fn insert_person_relationship(
        &self,
        id: &str,
        rel_type: &str,
        a_user: Option<&str>,
        a_alter: Option<&str>,
        b_user: Option<&str>,
        b_alter: Option<&str>,
        is_past_life: i32,
        created_by: Option<&str>,
    ) -> Result<u64> {
        let q = "INSERT INTO person_relationships (id, type, person_a_user_id, person_a_alter_id, person_b_user_id, person_b_alter_id, is_past_life, created_by_user_id, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, datetime('now'))";
        let mut query = sqlx::query(q)
            .bind(id)
            .bind(rel_type)
            .bind(a_user)
            .bind(a_alter)
            .bind(b_user)
            .bind(b_alter)
            .bind(is_past_life)
            .bind(created_by);
        let res = query.execute(&self.pool).await?;
        Ok(res.rows_affected())
    }

    /// Fetch relationships where the given entity (user or alter) participates
    pub async fn relationships_for_entity(&self, entity_id: &str, is_user: bool) -> Result<Vec<PersonRelationship>> {
        let start = Instant::now();
        let rows = if is_user {
            sqlx::query_as::<_, PersonRelationship>("SELECT * FROM person_relationships WHERE person_a_user_id = ?1 OR person_b_user_id = ?1")
                .bind(entity_id)
                .fetch_all(&self.pool)
                .await?
        } else {
            sqlx::query_as::<_, PersonRelationship>("SELECT * FROM person_relationships WHERE person_a_alter_id = ?1 OR person_b_alter_id = ?1")
                .bind(entity_id)
                .fetch_all(&self.pool)
                .await?
        };
        record_db_operation("relationships_for_entity", "person_relationships", "success", start.elapsed());
        Ok(rows)
    }

    /// Delete a relationship by id
    pub async fn delete_person_relationship(&self, id: &str) -> Result<u64> {
        let res = sqlx::query("DELETE FROM person_relationships WHERE id = ?1")
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(res.rows_affected())
    }
}
