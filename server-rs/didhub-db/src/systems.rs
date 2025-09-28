use crate::Db;
use crate::models::{SystemSummary, SystemDetail};
use crate::users::UserOperations;
use anyhow::Result;
use async_trait::async_trait;

#[derive(Debug, Clone)]
pub struct SystemListFilters {
    pub q: Option<String>,
}

#[async_trait]
pub trait SystemOperations {
    async fn list_system_users(&self, filters: &SystemListFilters, limit: i64, offset: i64) -> Result<(Vec<SystemSummary>, i64)>;
    async fn get_system_detail(&self, user_id: i64) -> Result<SystemDetail>;
}

#[async_trait]
impl SystemOperations for Db {
    async fn list_system_users(&self, filters: &SystemListFilters, limit: i64, offset: i64) -> Result<(Vec<SystemSummary>, i64)> {
        let base = r#"SELECT u.id, u.username, u.avatar,
                    (SELECT count(*) FROM alters a WHERE a.owner_user_id = u.id) as alters,
                    (SELECT count(*) FROM groups g WHERE g.owner_user_id = u.id) as groups,
                    (SELECT count(*) FROM subsystems s WHERE s.owner_user_id = u.id) as subsystems
                    FROM users u WHERE u.is_system=1"#;
        let mut sql = base.to_string();
        let mut params: Vec<(i32, String)> = Vec::new();
        if let Some(ref query) = filters.q {
            sql.push_str(" AND u.username LIKE ?1");
            params.push((1, format!("%{}%", query)));
        }
        sql.push_str(" ORDER BY u.id DESC LIMIT ?L OFFSET ?O");
        // Replace positional placeholders for limit/offset due to dynamic param count
        let mut next_pos = (params.len() as i32) + 1;
        sql = sql.replace("?L", &format!("?{}", next_pos));
        next_pos += 1;
        sql = sql.replace("?O", &format!("?{}", next_pos));
        let mut qx = sqlx::query_as::<_, (i64, String, Option<String>, i64, i64, i64)>(&sql);
        // bind search if present
        params.sort_by_key(|(i, _)| *i);
        for (_i, v) in params {
            qx = qx.bind(v);
        }
        qx = qx.bind(limit).bind(offset);
        let rows = qx.fetch_all(&self.pool).await?;

        // total count (without paging) for users matching filter
        let total = if filters.q.is_some() {
            let like = format!("%{}%", filters.q.clone().unwrap());
            let (c,): (i64,) = sqlx::query_as(
                "SELECT count(*) FROM users u WHERE u.is_system=1 AND u.username LIKE ?1",
            )
            .bind(like)
            .fetch_one(&self.pool)
            .await?;
            c
        } else {
            let (c,): (i64,) = sqlx::query_as("SELECT count(*) FROM users u WHERE u.is_system=1")
                .fetch_one(&self.pool)
                .await?;
            c
        };

        let items = rows
            .into_iter()
            .map(
                |(user_id, username, avatar, alters, groups, subsystems)| SystemSummary {
                    user_id,
                    username,
                    avatar,
                    alters,
                    groups,
                    subsystems,
                },
            )
            .collect();

        Ok((items, total))
    }

    async fn get_system_detail(&self, user_id: i64) -> Result<SystemDetail> {
        let alters = sqlx::query_as::<_, (i64,)>(
            "SELECT id FROM alters WHERE owner_user_id=?1 ORDER BY id DESC",
        )
        .bind(user_id)
        .fetch_all(&self.pool)
        .await?;

        let groups = sqlx::query_as::<_, (i64,)>(
            "SELECT id FROM groups WHERE owner_user_id=?1 ORDER BY id DESC",
        )
        .bind(user_id)
        .fetch_all(&self.pool)
        .await?;

        let subsystems = sqlx::query_as::<_, (i64,)>(
            "SELECT id FROM subsystems WHERE owner_user_id=?1 ORDER BY id DESC",
        )
        .bind(user_id)
        .fetch_all(&self.pool)
        .await?;

        // Get username from user
        let user = self.fetch_user_by_id(user_id).await?.ok_or_else(|| anyhow::anyhow!("User not found"))?;

        Ok(SystemDetail {
            user_id: user.id,
            username: user.username,
            alters: alters.into_iter().map(|r| r.0).collect(),
            groups: groups.into_iter().map(|r| r.0).collect(),
            subsystems: subsystems.into_iter().map(|r| r.0).collect(),
        })
    }
}