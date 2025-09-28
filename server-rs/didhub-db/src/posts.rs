use crate::common::CommonOperations;
use crate::models::Post;
use crate::Db;
use anyhow::Result;
use async_trait::async_trait;

#[async_trait]
pub trait PostOperations: Send + Sync {
    async fn create_post(&self, body: &str, created_by_user_id: Option<i64>) -> Result<Post>;
    async fn repost_post(
        &self,
        original_id: i64,
        created_by_user_id: Option<i64>,
    ) -> Result<Option<Post>>;
    async fn fetch_post(&self, id: i64) -> Result<Option<Post>>;
    async fn list_posts(&self, limit: i64, offset: i64) -> Result<Vec<Post>>;
    async fn delete_post(&self, id: i64) -> Result<bool>;
}

#[async_trait]
impl PostOperations for Db {
    async fn create_post(&self, body: &str, created_by_user_id: Option<i64>) -> Result<Post> {
        if body.trim().is_empty() {
            anyhow::bail!("body required");
        }
        let body = body.to_string();
        let created_by_user_id = created_by_user_id;
        let rec = self.insert_and_return(
            || async {
                let r = sqlx::query_as::<_, Post>("INSERT INTO posts (body, created_by_user_id) VALUES (?1, ?2) RETURNING id, body, created_by_user_id, repost_of_post_id, created_at")
                    .bind(&body)
                    .bind(created_by_user_id)
                    .fetch_one(&self.pool).await?;
                Ok(r)
            },
            || async {
                sqlx::query("INSERT INTO posts (body, created_by_user_id) VALUES (?1, ?2)")
                    .bind(&body)
                    .bind(created_by_user_id)
                    .execute(&self.pool).await?;
                let r = sqlx::query_as::<_, Post>("SELECT id, body, created_by_user_id, repost_of_post_id, created_at FROM posts WHERE id = LAST_INSERT_ID()")
                    .fetch_one(&self.pool).await?;
                Ok(r)
            }
        ).await?;
        Ok(rec)
    }

    async fn repost_post(
        &self,
        original_id: i64,
        created_by_user_id: Option<i64>,
    ) -> Result<Option<Post>> {
        let orig = sqlx::query_as::<_, Post>("SELECT id, body, created_by_user_id, repost_of_post_id, created_at FROM posts WHERE id=?1")
            .bind(original_id)
            .fetch_optional(&self.pool).await?;
        let Some(_o) = orig else {
            return Ok(None);
        };
        let created_by_user_id = created_by_user_id;
        let orig_id = original_id;
        let rec = self.insert_and_return(
            || async {
                let r = sqlx::query_as::<_, Post>("INSERT INTO posts (body, created_by_user_id, repost_of_post_id) SELECT body, ?1, id FROM posts WHERE id=?2 RETURNING id, body, created_by_user_id, repost_of_post_id, created_at")
                    .bind(created_by_user_id)
                    .bind(orig_id)
                    .fetch_one(&self.pool).await?;
                Ok(r)
            },
            || async {
                sqlx::query("INSERT INTO posts (body, created_by_user_id, repost_of_post_id) SELECT body, ?1, id FROM posts WHERE id=?2")
                    .bind(created_by_user_id)
                    .bind(orig_id)
                    .execute(&self.pool).await?;
                let r = sqlx::query_as::<_, Post>("SELECT id, body, created_by_user_id, repost_of_post_id, created_at FROM posts WHERE id = LAST_INSERT_ID()")
                    .fetch_one(&self.pool).await?;
                Ok(r)
            }
        ).await?;
        Ok(Some(rec))
    }

    async fn fetch_post(&self, id: i64) -> Result<Option<Post>> {
        Ok(sqlx::query_as::<_, Post>("SELECT id, body, created_by_user_id, repost_of_post_id, created_at FROM posts WHERE id=?1")
            .bind(id)
            .fetch_optional(&self.pool).await?)
    }

    async fn list_posts(&self, limit: i64, offset: i64) -> Result<Vec<Post>> {
        let rows = sqlx::query_as::<_, Post>("SELECT id, body, created_by_user_id, repost_of_post_id, created_at FROM posts ORDER BY created_at DESC, id DESC LIMIT ?1 OFFSET ?2")
            .bind(limit)
            .bind(offset)
            .fetch_all(&self.pool).await?;
        Ok(rows)
    }

    async fn delete_post(&self, id: i64) -> Result<bool> {
        let res = sqlx::query("DELETE FROM posts WHERE id=?1")
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(res.rows_affected() > 0)
    }
}
