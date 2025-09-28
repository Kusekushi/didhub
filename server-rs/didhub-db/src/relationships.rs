use crate::models::*;
use crate::Db;
use anyhow::Result;

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
    async fn replace_partners(&self, id: i64, partners: &[i64]) -> Result<()>;
    async fn replace_parents(&self, id: i64, parents: &[i64]) -> Result<()>;
    async fn replace_children(&self, id: i64, children: &[i64]) -> Result<()>;
    async fn replace_affiliations(&self, id: i64, affiliations: &[i64]) -> Result<()>;
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
    async fn replace_partners(&self, id: i64, partners: &[i64]) -> Result<()> {
        sqlx::query("DELETE FROM alter_partners WHERE alter_id=?1 OR partner_alter_id=?1")
            .bind(id)
            .execute(&self.pool)
            .await?;
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
            sqlx::query(&q)
                .bind(low)
                .bind(high)
                .execute(&self.pool)
                .await?;
        }
        Ok(())
    }

    async fn replace_parents(&self, id: i64, parents: &[i64]) -> Result<()> {
        sqlx::query("DELETE FROM alter_parents WHERE alter_id=?1")
            .bind(id)
            .execute(&self.pool)
            .await?;
        for p in parents {
            if *p == id {
                continue;
            }
            let q = insert_ignore_query(
                self.backend,
                "alter_parents",
                &["alter_id", "parent_alter_id"],
            );
            sqlx::query(&q)
                .bind(id)
                .bind(*p)
                .execute(&self.pool)
                .await?;
        }
        Ok(())
    }

    async fn replace_children(&self, id: i64, children: &[i64]) -> Result<()> {
        sqlx::query("DELETE FROM alter_parents WHERE parent_alter_id=?1")
            .bind(id)
            .execute(&self.pool)
            .await?;
        for c in children {
            if *c == id {
                continue;
            }
            let q = insert_ignore_query(
                self.backend,
                "alter_parents",
                &["alter_id", "parent_alter_id"],
            );
            sqlx::query(&q)
                .bind(*c)
                .bind(id)
                .execute(&self.pool)
                .await?;
        }
        Ok(())
    }

    async fn replace_affiliations(&self, id: i64, affiliations: &[i64]) -> Result<()> {
        sqlx::query("DELETE FROM alter_affiliations WHERE alter_id=?1")
            .bind(id)
            .execute(&self.pool)
            .await?;
        for a in affiliations {
            let q = insert_ignore_query(
                self.backend,
                "alter_affiliations",
                &["affiliation_id", "alter_id"],
            );
            sqlx::query(&q)
                .bind(*a)
                .bind(id)
                .execute(&self.pool)
                .await?;
        }
        Ok(())
    }

    async fn partners_of(&self, id: i64) -> Result<Vec<i64>> {
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
        Ok(out)
    }

    async fn parents_of(&self, id: i64) -> Result<Vec<i64>> {
        let rows = sqlx::query_as::<_, (i64,)>(
            "SELECT parent_alter_id FROM alter_parents WHERE alter_id=?1",
        )
        .bind(id)
        .fetch_all(&self.pool)
        .await?;
        Ok(rows.into_iter().map(|r| r.0).collect())
    }

    async fn children_of(&self, id: i64) -> Result<Vec<i64>> {
        let rows = sqlx::query_as::<_, (i64,)>(
            "SELECT alter_id FROM alter_parents WHERE parent_alter_id=?1",
        )
        .bind(id)
        .fetch_all(&self.pool)
        .await?;
        Ok(rows.into_iter().map(|r| r.0).collect())
    }

    async fn affiliations_of(&self, id: i64) -> Result<Vec<i64>> {
        let rows = sqlx::query_as::<_, (i64,)>(
            "SELECT affiliation_id FROM alter_affiliations WHERE alter_id=?1",
        )
        .bind(id)
        .fetch_all(&self.pool)
        .await?;
        Ok(rows.into_iter().map(|r| r.0).collect())
    }

    async fn list_alters_in_group(&self, group_id: i64) -> Result<Vec<i64>> {
        let rows = sqlx::query_as::<_, (i64,)>(
            "SELECT alter_id FROM alter_affiliations WHERE affiliation_id=?1",
        )
        .bind(group_id)
        .fetch_all(&self.pool)
        .await?;
        Ok(rows.into_iter().map(|r| r.0).collect())
    }

    async fn list_user_groups_scoped(
        &self,
        user_id: i64,
        query: Option<&str>,
    ) -> Result<Vec<Group>> {
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
        Ok(rows)
    }

    async fn remove_user_from_group(&self, user_id: i64, group_id: i64) -> Result<bool> {
        let res =
            sqlx::query("DELETE FROM user_group_memberships WHERE user_id=?1 AND group_id=?2")
                .bind(user_id)
                .bind(group_id)
                .execute(&self.pool)
                .await?;
        Ok(res.rows_affected() > 0)
    }

    async fn add_user_to_group(&self, user_id: i64, group_id: i64) -> Result<bool> {
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
        Ok(res.rows_affected() > 0)
    }

    async fn prune_orphan_group_members(&self) -> Result<i64> {
        let res = sqlx::query("DELETE FROM user_group_memberships WHERE user_id NOT IN (SELECT id FROM users) OR group_id NOT IN (SELECT id FROM groups)")
            .execute(&self.pool)
            .await?;
        Ok(res.rows_affected() as i64)
    }

    async fn prune_orphan_subsystem_members(&self) -> Result<i64> {
        let res = sqlx::query("DELETE FROM alter_affiliations WHERE alter_id NOT IN (SELECT id FROM alters) OR affiliation_id NOT IN (SELECT id FROM subsystems)")
            .execute(&self.pool)
            .await?;
        Ok(res.rows_affected() as i64)
    }
}
