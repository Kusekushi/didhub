use crate::models::*;
use crate::Db;
use anyhow::Result;
use didhub_metrics::record_db_operation;
use std::time::Instant;

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
    async fn replace_partners(&self, id: i64, partners: &[i64]) -> Result<u64>;
    async fn replace_parents(&self, id: i64, parents: &[i64]) -> Result<u64>;
    async fn replace_children(&self, id: i64, children: &[i64]) -> Result<u64>;
    async fn replace_affiliations(&self, id: i64, affiliations: &[i64]) -> Result<u64>;
    async fn partners_of(&self, id: i64) -> Result<Vec<i64>>;
    async fn parents_of(&self, id: i64) -> Result<Vec<i64>>;
    async fn children_of(&self, id: i64) -> Result<Vec<i64>>;
    async fn affiliations_of(&self, id: i64) -> Result<Vec<i64>>;
    async fn remove_user_from_group(&self, user_id: i64, group_id: i64) -> Result<bool>;
    async fn add_user_to_group(&self, user_id: i64, group_id: i64) -> Result<bool>;
    async fn prune_orphan_group_members(&self) -> Result<i64>;
    async fn prune_orphan_subsystem_members(&self) -> Result<i64>;
    async fn list_user_groups_scoped(
        &self,
        user_id: i64,
        query: Option<&str>,
    ) -> Result<Vec<Group>>;
    async fn list_alters_in_group(&self, group_id: i64) -> Result<Vec<i64>>;
}

#[async_trait::async_trait]
impl AlterRelationships for Db {
    async fn replace_partners(&self, id: i64, partners: &[i64]) -> Result<u64> {
        let start = Instant::now();
        let mut rows_affected =
            sqlx::query("DELETE FROM alter_partners WHERE alter_id=?1 OR partner_alter_id=?1")
                .bind(id)
                .execute(&self.pool)
                .await?
                .rows_affected();
        for p in partners {
            if *p == id {
                continue;
            }
            let (low, high) = if id < *p { (id, *p) } else { (*p, id) };
            let q = insert_ignore_query(
                self.backend,
                "alter_partners",
                &["alter_id", "partner_alter_id"],
            );
            rows_affected += sqlx::query(&q)
                .bind(low)
                .bind(high)
                .execute(&self.pool)
                .await?
                .rows_affected();
        }
        record_db_operation("replace_partners", "alter_partners", "success", start.elapsed());
        Ok(rows_affected)
    }

    async fn replace_parents(&self, id: i64, parents: &[i64]) -> Result<u64> {
        let start = Instant::now();
        let mut rows_affected = sqlx::query("DELETE FROM alter_parents WHERE alter_id=?1")
            .bind(id)
            .execute(&self.pool)
            .await?
            .rows_affected();
        for p in parents {
            if *p == id {
                continue;
            }
            let q = insert_ignore_query(
                self.backend,
                "alter_parents",
                &["alter_id", "parent_alter_id"],
            );
            rows_affected += sqlx::query(&q)
                .bind(id)
                .bind(*p)
                .execute(&self.pool)
                .await?
                .rows_affected();
        }
        record_db_operation("replace_parents", "alter_parents", "success", start.elapsed());
        Ok(rows_affected)
    }

    async fn replace_children(&self, id: i64, children: &[i64]) -> Result<u64> {
        let start = Instant::now();
        let mut rows_affected = sqlx::query("DELETE FROM alter_parents WHERE parent_alter_id=?1")
            .bind(id)
            .execute(&self.pool)
            .await?
            .rows_affected();
        for c in children {
            if *c == id {
                continue;
            }
            let q = insert_ignore_query(
                self.backend,
                "alter_parents",
                &["alter_id", "parent_alter_id"],
            );
            rows_affected += sqlx::query(&q)
                .bind(*c)
                .bind(id)
                .execute(&self.pool)
                .await?
                .rows_affected();
        }
        record_db_operation("replace_children", "alter_parents", "success", start.elapsed());
        Ok(rows_affected)
    }

    async fn replace_affiliations(&self, id: i64, affiliations: &[i64]) -> Result<u64> {
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
                .bind(*a)
                .bind(id)
                .execute(&self.pool)
                .await?
                .rows_affected();
        }
        record_db_operation("replace_affiliations", "alter_affiliations", "success", start.elapsed());
        Ok(rows_affected)
    }

    async fn partners_of(&self, id: i64) -> Result<Vec<i64>> {
        let start = Instant::now();
        let rows = sqlx::query_as::<_, (i64,i64)>("SELECT alter_id, partner_alter_id FROM alter_partners WHERE alter_id=?1 OR partner_alter_id=?1")
            .bind(id).fetch_all(&self.pool).await?;
        let mut out = Vec::new();
        for (a, b) in rows {
            if a == id {
                out.push(b);
            } else {
                out.push(a);
            }
        }
        out.sort();
        out.dedup();
        record_db_operation("partners_of", "alter_partners", "success", start.elapsed());
        Ok(out)
    }

    async fn parents_of(&self, id: i64) -> Result<Vec<i64>> {
        let start = Instant::now();
        let rows = sqlx::query_as::<_, (i64,)>(
            "SELECT parent_alter_id FROM alter_parents WHERE alter_id=?1",
        )
        .bind(id)
        .fetch_all(&self.pool)
        .await?;
        let result = rows.into_iter().map(|r| r.0).collect();
        record_db_operation("parents_of", "alter_parents", "success", start.elapsed());
        Ok(result)
    }

    async fn children_of(&self, id: i64) -> Result<Vec<i64>> {
        let start = Instant::now();
        let rows = sqlx::query_as::<_, (i64,)>(
            "SELECT alter_id FROM alter_parents WHERE parent_alter_id=?1",
        )
        .bind(id)
        .fetch_all(&self.pool)
        .await?;
        let result = rows.into_iter().map(|r| r.0).collect();
        record_db_operation("children_of", "alter_parents", "success", start.elapsed());
        Ok(result)
    }

    async fn affiliations_of(&self, id: i64) -> Result<Vec<i64>> {
        let start = Instant::now();
        let rows = sqlx::query_as::<_, (i64,)>(
            "SELECT affiliation_id FROM alter_affiliations WHERE alter_id=?1",
        )
        .bind(id)
        .fetch_all(&self.pool)
        .await?;
        let result = rows.into_iter().map(|r| r.0).collect();
        record_db_operation("affiliations_of", "alter_affiliations", "success", start.elapsed());
        Ok(result)
    }

    async fn list_alters_in_group(&self, group_id: i64) -> Result<Vec<i64>> {
        let start = Instant::now();
        let rows = sqlx::query_as::<_, (i64,)>(
            "SELECT alter_id FROM alter_affiliations WHERE affiliation_id=?1",
        )
        .bind(group_id)
        .fetch_all(&self.pool)
        .await?;
        let result = rows.into_iter().map(|r| r.0).collect();
        record_db_operation("list_alters_in_group", "alter_affiliations", "success", start.elapsed());
        Ok(result)
    }

    async fn list_user_groups_scoped(
        &self,
        user_id: i64,
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
        record_db_operation("list_user_groups_scoped", "user_group_memberships", "success", start.elapsed());
        Ok(rows)
    }

    async fn remove_user_from_group(&self, user_id: i64, group_id: i64) -> Result<bool> {
        let start = Instant::now();
        let res =
            sqlx::query("DELETE FROM user_group_memberships WHERE user_id=?1 AND group_id=?2")
                .bind(user_id)
                .bind(group_id)
                .execute(&self.pool)
                .await?;
        let success = res.rows_affected() > 0;
        record_db_operation("remove_user_from_group", "user_group_memberships", if success { "success" } else { "not_found" }, start.elapsed());
        Ok(success)
    }

    async fn add_user_to_group(&self, user_id: i64, group_id: i64) -> Result<bool> {
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
        record_db_operation("add_user_to_group", "user_group_memberships", if success { "success" } else { "already_exists" }, start.elapsed());
        Ok(success)
    }

    async fn prune_orphan_group_members(&self) -> Result<i64> {
        let start = Instant::now();
        let res = sqlx::query("DELETE FROM user_group_memberships WHERE user_id NOT IN (SELECT id FROM users) OR group_id NOT IN (SELECT id FROM groups)")
            .execute(&self.pool)
            .await?;
        let rows_affected = res.rows_affected() as i64;
        record_db_operation("prune_orphan_group_members", "user_group_memberships", "success", start.elapsed());
        Ok(rows_affected)
    }

    async fn prune_orphan_subsystem_members(&self) -> Result<i64> {
        let start = Instant::now();
        let res = sqlx::query("DELETE FROM alter_affiliations WHERE alter_id NOT IN (SELECT id FROM alters) OR affiliation_id NOT IN (SELECT id FROM subsystems)")
            .execute(&self.pool)
            .await?;
        let rows_affected = res.rows_affected() as i64;
        record_db_operation("prune_orphan_subsystem_members", "alter_affiliations", "success", start.elapsed());
        Ok(rows_affected)
    }
}
