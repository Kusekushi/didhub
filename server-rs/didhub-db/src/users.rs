use crate::common::CommonOperations;
use crate::{Db, DbBackend};
use crate::models::{NewUser, PasswordResetToken, UpdateUserFields, User, UserListFilters};
use anyhow::Result;
use async_trait::async_trait;
use tracing::{debug, info, warn};

#[async_trait]
pub trait UserOperations {
    // User CRUD operations
    async fn create_user(&self, nu: NewUser) -> Result<User>;
    async fn fetch_user_by_username(&self, username: &str) -> Result<Option<User>>;
    async fn fetch_user_by_id(&self, id: i64) -> Result<Option<User>>;
    async fn list_users(&self, limit: i64, offset: i64) -> Result<Vec<User>>;
    async fn list_users_advanced(&self, filters: &UserListFilters) -> Result<(Vec<User>, i64)>;
    async fn update_user(&self, id: i64, fields: UpdateUserFields) -> Result<Option<User>>;
    async fn update_user_password(&self, id: i64, password_hash: &str) -> Result<Option<User>>;
    async fn delete_user(&self, id: i64) -> Result<bool>;
    async fn reassign_user_content(&self, from_user: i64, to_user: i64) -> Result<()>;

    // OIDC identity operations
    async fn fetch_user_by_oidc(&self, provider: &str, subject: &str) -> Result<Option<User>>;
    async fn link_oidc_identity(&self, provider: &str, subject: &str, user_id: i64) -> Result<()>;

    // Password reset operations
    async fn insert_password_reset(
        &self,
        selector: &str,
        verifier_hash: &str,
        user_id: i64,
        expires_at: &str,
    ) -> Result<PasswordResetToken>;
    async fn fetch_password_reset_by_selector(
        &self,
        selector: &str,
    ) -> Result<Option<PasswordResetToken>>;
    async fn mark_password_reset_used(&self, id: i64) -> Result<()>;
    async fn validate_password_reset_token(&self, token_id: i64, current_time: &str) -> Result<bool>;
    async fn clear_expired_password_resets(&self) -> Result<i64>;
}

#[async_trait]
impl UserOperations for Db {
    async fn create_user(&self, nu: NewUser) -> Result<User> {
        let username = nu.username.clone();
        debug!(username=%username, is_system=%nu.is_system, is_approved=%nu.is_approved, "creating new user");
        let password_hash = nu.password_hash;
        let is_system = if nu.is_system { 1 } else { 0 };
        let is_approved = if nu.is_approved { 1 } else { 0 };
        let rec = self.insert_and_return(
            || async {
                let r = sqlx::query_as::<_, User>("INSERT INTO users (username, password_hash, is_system, is_approved) VALUES (?1, ?2, ?3, ?4) RETURNING id, username, password_hash, avatar, is_system, is_admin, is_approved, must_change_password, created_at")
                    .bind(&username)
                    .bind(&password_hash)
                    .bind(is_system)
                    .bind(is_approved)
                    .fetch_one(&self.pool).await?;
                Ok(r)
            },
            || async {
                sqlx::query("INSERT INTO users (username, password_hash, is_system, is_approved) VALUES (?1, ?2, ?3, ?4)")
                    .bind(&username)
                    .bind(&password_hash)
                    .bind(is_system)
                    .bind(is_approved)
                    .execute(&self.pool).await?;
                let r = sqlx::query_as::<_, User>("SELECT id, username, password_hash, avatar, is_system, is_admin, is_approved, must_change_password, created_at FROM users WHERE id = LAST_INSERT_ID()")
                    .fetch_one(&self.pool).await?;
                Ok(r)
            }
        ).await?;
        info!(user_id=%rec.id, username=%rec.username, "user created successfully");
        Ok(rec)
    }

    async fn fetch_user_by_username(&self, username: &str) -> Result<Option<User>> {
        let rec = sqlx::query_as::<_, User>("SELECT * FROM users WHERE username = ?1")
            .bind(username)
            .fetch_optional(&self.pool)
            .await?;
        Ok(rec)
    }

    async fn fetch_user_by_id(&self, id: i64) -> Result<Option<User>> {
        let rec = sqlx::query_as::<_, User>("SELECT * FROM users WHERE id=?1")
            .bind(id)
            .fetch_optional(&self.pool)
            .await?;
        Ok(rec)
    }

    async fn list_users(&self, limit: i64, offset: i64) -> Result<Vec<User>> {
        let rows =
            sqlx::query_as::<_, User>("SELECT * FROM users ORDER BY id DESC LIMIT ?1 OFFSET ?2")
                .bind(limit)
                .bind(offset)
                .fetch_all(&self.pool)
                .await?;
        Ok(rows)
    }

    async fn list_users_advanced(&self, filters: &UserListFilters) -> Result<(Vec<User>, i64)> {
        // Build WHERE conditions & binds
        let mut conditions: Vec<String> = Vec::new();
        // We will push binds in order used in conditions
        enum B {
            I(i64),
            S(String),
        }
        let mut binds: Vec<B> = Vec::new();
        if let Some(ref q) = filters.q {
            conditions.push("username LIKE ?".into());
            binds.push(B::S(format!("%{}%", q)));
        }
        if let Some(v) = filters.is_admin {
            conditions.push("is_admin = ?".into());
            binds.push(B::I(if v { 1 } else { 0 }));
        }
        if let Some(v) = filters.is_system {
            conditions.push("is_system = ?".into());
            binds.push(B::I(if v { 1 } else { 0 }));
        }
        if let Some(v) = filters.is_approved {
            conditions.push("is_approved = ?".into());
            binds.push(B::I(if v { 1 } else { 0 }));
        }
        let where_clause = if conditions.is_empty() {
            String::new()
        } else {
            format!(" WHERE {}", conditions.join(" AND "))
        };
        let base = format!("FROM users{}", where_clause);
        let count_sql = format!("SELECT COUNT(*) {}", base);
        let select_sql = format!(
            "SELECT id, username, password_hash, avatar, is_system, is_admin, is_approved, must_change_password, created_at {} ORDER BY {} {} LIMIT ? OFFSET ?",
            base,
            filters.sort_by,
            if filters.order_desc { "DESC" } else { "ASC" }
        );
        // Count
        let mut cq = sqlx::query_scalar::<_, i64>(&count_sql);
        for b in &binds {
            match b {
                B::I(i) => {
                    cq = cq.bind(*i);
                }
                B::S(s) => {
                    cq = cq.bind(s);
                }
            }
        }
        let total: i64 = cq.fetch_one(&self.pool).await?;
        // Rows
        let mut sq = sqlx::query_as::<_, User>(&select_sql);
        for b in &binds {
            match b {
                B::I(i) => {
                    sq = sq.bind(*i);
                }
                B::S(s) => {
                    sq = sq.bind(s);
                }
            }
        }
        sq = sq.bind(filters.limit).bind(filters.offset);
        let rows = sq.fetch_all(&self.pool).await?;
        Ok((rows, total))
    }

    async fn update_user(&self, id: i64, fields: UpdateUserFields) -> Result<Option<User>> {
        debug!(user_id=%id, has_password=%fields.password_hash.is_some(), has_system=%fields.is_system.is_some(), has_admin=%fields.is_admin.is_some(), has_approved=%fields.is_approved.is_some(), has_must_change=%fields.must_change_password.is_some(), has_avatar=%fields.avatar.is_some(), "updating user");
        let mut sets: Vec<String> = Vec::new();
        // We'll build query manually with positional parameters ?1..?N.
        // Instead of complicated generic arg building, construct raw SQL string and bind sequentially.
        let mut sql = String::from("UPDATE users SET ");
        let mut idx: i32 = 1;
        enum BindVal {
            S(String),
            Null,
        }
        let mut bind_values: Vec<(i32, BindVal)> = Vec::new();
        macro_rules! push_bool_field {
            ($opt:expr, $name:literal) => {
                if let Some(v) = $opt {
                    sets.push(format!("{}=?{}", $name, idx));
                    bind_values.push((idx, BindVal::S((if v { 1 } else { 0 }).to_string())));
                    idx += 1;
                }
            };
        }
        if let Some(ref ph) = fields.password_hash {
            sets.push(format!("password_hash=?{}", idx));
            bind_values.push((idx, BindVal::S(ph.clone())));
            idx += 1;
        }
        push_bool_field!(fields.is_system, "is_system");
        push_bool_field!(fields.is_admin, "is_admin");
        push_bool_field!(fields.is_approved, "is_approved");
        push_bool_field!(fields.must_change_password, "must_change_password");
        if let Some(av_opt) = fields.avatar {
            sets.push(format!("avatar=?{}", idx));
            match av_opt {
                Some(s) => bind_values.push((idx, BindVal::S(s))),
                None => bind_values.push((idx, BindVal::Null)),
            }
            idx += 1;
        }
        if sets.is_empty() {
            return self.fetch_user_by_id(id).await;
        }
        sql.push_str(&sets.join(","));
        sql.push_str(&format!(" WHERE id=?{}", idx));
        let id_pos = idx;
        bind_values.push((id_pos, BindVal::S(id.to_string())));
        // Build query with dynamic positional binds
        let mut q = sqlx::query(&sql);
        // sort by position
        bind_values.sort_by_key(|(i, _)| *i);
        for (_, v) in bind_values {
            match v {
                BindVal::S(s) => {
                    q = q.bind(s);
                }
                BindVal::Null => {
                    q = q.bind(None::<String>);
                }
            }
        }
        q.execute(&self.pool).await?;
        let result = self.fetch_user_by_id(id).await;
        if let Ok(Some(ref user)) = &result {
            info!(user_id=%user.id, username=%user.username, "user updated successfully");
        }
        result
    }

    async fn update_user_password(&self, id: i64, password_hash: &str) -> Result<Option<User>> {
        debug!(user_id=%id, "updating user password");
        sqlx::query("UPDATE users SET password_hash=?1, must_change_password=0 WHERE id=?2")
            .bind(password_hash)
            .bind(id)
            .execute(&self.pool)
            .await?;
        let result = self.fetch_user_by_id(id).await;
        if let Ok(Some(ref user)) = &result {
            info!(user_id=%user.id, username=%user.username, "user password updated successfully");
        }
        result
    }

    async fn delete_user(&self, id: i64) -> Result<bool> {
        debug!(user_id=%id, "deleting user and related data");
        // Remove related non-audit references first (audit logs intentionally retained if referencing user id textually)
        // OIDC identities
        sqlx::query("DELETE FROM oidc_identities WHERE user_id=?1")
            .bind(id)
            .execute(&self.pool)
            .await?;
        // Password reset tokens
        sqlx::query("DELETE FROM password_reset_tokens WHERE user_id=?1")
            .bind(id)
            .execute(&self.pool)
            .await?;
        // Future: clear other dependent tables (sessions, api keys, etc.) when added
        let res = sqlx::query("DELETE FROM users WHERE id=?1")
            .bind(id)
            .execute(&self.pool)
            .await?;
        let deleted = res.rows_affected() > 0;
        if deleted {
            info!(user_id=%id, "user deleted successfully");
        } else {
            warn!(user_id=%id, "user deletion failed - user not found");
        }
        Ok(deleted)
    }

    async fn reassign_user_content(&self, from_user: i64, to_user: i64) -> Result<()> {
        // For each table that has owner_user_id, update rows referencing from_user
        for (table, col) in [
            ("groups", "owner_user_id"),
            ("subsystems", "owner_user_id"),
            ("alters", "owner_user_id"),
        ] {
            let sql = format!("UPDATE {} SET {}=?1 WHERE {}=?2", table, col, col);
            sqlx::query(&sql)
                .bind(to_user)
                .bind(from_user)
                .execute(&self.pool)
                .await?;
        }
        Ok(())
    }

    async fn fetch_user_by_oidc(&self, provider: &str, subject: &str) -> Result<Option<User>> {
        let rec = sqlx::query_as::<_, User>("SELECT u.* FROM users u JOIN oidc_identities oi ON oi.user_id = u.id WHERE oi.provider=?1 AND oi.subject=?2")
            .bind(provider)
            .bind(subject)
            .fetch_optional(&self.pool)
            .await?;
        Ok(rec)
    }

    async fn link_oidc_identity(&self, provider: &str, subject: &str, user_id: i64) -> Result<()> {
        match self.backend {
            DbBackend::Sqlite => {
                sqlx::query("INSERT OR IGNORE INTO oidc_identities(provider, subject, user_id) VALUES (?1, ?2, ?3)")
                    .bind(provider)
                    .bind(subject)
                    .bind(user_id)
                    .execute(&self.pool)
                    .await?;
            }
            DbBackend::Postgres => {
                sqlx::query("INSERT INTO oidc_identities(provider, subject, user_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING")
                    .bind(provider)
                    .bind(subject)
                    .bind(user_id)
                    .execute(&self.pool)
                    .await?;
            }
            DbBackend::MySql => {
                sqlx::query("INSERT IGNORE INTO oidc_identities(provider, subject, user_id) VALUES (?1, ?2, ?3)")
                    .bind(provider)
                    .bind(subject)
                    .bind(user_id)
                    .execute(&self.pool)
                    .await?;
            }
        }
        Ok(())
    }

    async fn insert_password_reset(
        &self,
        selector: &str,
        verifier_hash: &str,
        user_id: i64,
        expires_at: &str,
    ) -> Result<PasswordResetToken> {
        let sel = selector.to_string();
        let vh = verifier_hash.to_string();
        let exp = expires_at.to_string();
        let rec = self.insert_and_return(
            || async {
                let r = sqlx::query_as::<_, PasswordResetToken>("INSERT INTO password_reset_tokens (selector, verifier_hash, user_id, expires_at) VALUES (?1, ?2, ?3, ?4) RETURNING *")
                    .bind(&sel)
                    .bind(&vh)
                    .bind(user_id)
                    .bind(&exp)
                    .fetch_one(&self.pool).await?;
                Ok(r)
            },
            || async {
                sqlx::query("INSERT INTO password_reset_tokens (selector, verifier_hash, user_id, expires_at) VALUES (?1, ?2, ?3, ?4)")
                    .bind(&sel)
                    .bind(&vh)
                    .bind(user_id)
                    .bind(&exp)
                    .execute(&self.pool).await?;
                let r = sqlx::query_as::<_, PasswordResetToken>("SELECT * FROM password_reset_tokens WHERE id = LAST_INSERT_ID()")
                    .fetch_one(&self.pool).await?;
                Ok(r)
            }
        ).await?;
        Ok(rec)
    }

    async fn fetch_password_reset_by_selector(
        &self,
        selector: &str,
    ) -> Result<Option<PasswordResetToken>> {
        Ok(sqlx::query_as::<_, PasswordResetToken>(
            "SELECT * FROM password_reset_tokens WHERE selector=?1",
        )
        .bind(selector)
        .fetch_optional(&self.pool)
        .await?)
    }

    async fn mark_password_reset_used(&self, id: i64) -> Result<()> {
        let now = chrono::Utc::now().to_rfc3339();
        sqlx::query("UPDATE password_reset_tokens SET used_at=?1 WHERE id=?2")
            .bind(&now)
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    async fn validate_password_reset_token(&self, token_id: i64, current_time: &str) -> Result<bool> {
        let (still_valid,):(i64,) = sqlx::query_as("SELECT CASE WHEN used_at IS NULL AND expires_at >= ?1 THEN 1 ELSE 0 END FROM password_reset_tokens WHERE id=?2")
            .bind(current_time)
            .bind(token_id)
            .fetch_one(&self.pool)
            .await?;
        Ok(still_valid == 1)
    }

    async fn clear_expired_password_resets(&self) -> Result<i64> {
        let now = chrono::Utc::now().to_rfc3339();
        let res = sqlx::query(
            "DELETE FROM password_reset_tokens WHERE (used_at IS NOT NULL) OR expires_at < ?1",
        )
        .bind(&now)
        .execute(&self.pool)
        .await?;
        Ok(res.rows_affected() as i64)
    }
}
