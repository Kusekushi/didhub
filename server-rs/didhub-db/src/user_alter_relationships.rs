use crate::common::CommonOperations;
use crate::models::{NewUserAlterRelationship, UserAlterRelationship};
use crate::Db;
use anyhow::Result;
use async_trait::async_trait;
use uuid::Uuid;

#[async_trait]
pub trait UserAlterRelationshipOperations: Send + Sync {
    async fn create_user_alter_relationship(
        &self,
        relationship: &NewUserAlterRelationship,
    ) -> Result<UserAlterRelationship>;
    async fn replace_user_alter_relationships(
        &self,
        alter_id: &str,
        relationships: &[NewUserAlterRelationship],
    ) -> Result<(Vec<UserAlterRelationship>, u64)>;
    async fn delete_user_alter_relationship(
        &self,
        user_id: &str,
        alter_id: &str,
        relationship_type: &str,
    ) -> Result<bool>;
    async fn list_user_alter_relationships_by_alter(
        &self,
        alter_id: &str,
    ) -> Result<Vec<UserAlterRelationship>>;
    async fn list_user_alter_relationships_by_user(
        &self,
        user_id: &str,
    ) -> Result<Vec<UserAlterRelationship>>;
    async fn list_user_alter_relationships_by_type(
        &self,
        relationship_type: &str,
    ) -> Result<Vec<UserAlterRelationship>>;
    async fn get_user_alter_relationship(
        &self,
        user_id: &str,
        alter_id: &str,
        relationship_type: &str,
    ) -> Result<Option<UserAlterRelationship>>;
}

#[async_trait]
impl UserAlterRelationshipOperations for Db {
    async fn create_user_alter_relationship(
        &self,
        relationship: &NewUserAlterRelationship,
    ) -> Result<UserAlterRelationship> {
        let user_id = &relationship.user_id;
        let alter_id = &relationship.alter_id;
        let relationship_type = relationship.relationship_type.clone();

        let rec = self.insert_and_return(
            || async {
                // SQLite/Postgres: Generate UUID and insert
                let id = Uuid::new_v4().to_string();
                // TODO: Act upon failure
                let _insert_result = sqlx::query("INSERT INTO user_alter_relationships (id, user_id, alter_id, relationship_type) VALUES (?1, ?2, ?3, ?4)")
                    .bind(&id)
                    .bind(user_id)
                    .bind(alter_id)
                    .bind(&relationship_type)
                    .execute(&self.pool)
                    .await?;
                let r = sqlx::query_as::<_, UserAlterRelationship>(
                    "SELECT uar.id, uar.user_id, uar.alter_id, uar.relationship_type, uar.created_at, u.username
                     FROM user_alter_relationships uar
                     JOIN users u ON uar.user_id = u.id
                     WHERE uar.id = ?1"
                )
                .bind(&id)
                .fetch_one(&self.pool)
                .await?;
                Ok(r)
            },
            || async {
                // MySQL: Generate UUID and insert
                let id = Uuid::new_v4().to_string();
                sqlx::query("INSERT INTO user_alter_relationships (id, user_id, alter_id, relationship_type) VALUES (?1, ?2, ?3, ?4)")
                    .bind(&id)
                    .bind(user_id)
                    .bind(alter_id)
                    .bind(&relationship_type)
                    .execute(&self.pool)
                    .await?;
                let r = sqlx::query_as::<_, UserAlterRelationship>(
                    "SELECT uar.id, uar.user_id, uar.alter_id, uar.relationship_type, uar.created_at, u.username
                     FROM user_alter_relationships uar
                     JOIN users u ON uar.user_id = u.id
                     WHERE uar.id = ?1"
                )
                .bind(&id)
                .fetch_one(&self.pool)
                .await?;
                Ok(r)
            }
        ).await?;

        Ok(rec)
    }

    async fn replace_user_alter_relationships(
        &self,
        alter_id: &str,
        relationships: &[NewUserAlterRelationship],
    ) -> Result<(Vec<UserAlterRelationship>, u64)> {
        let mut tx = self.pool.begin().await?;

        let delete_result = sqlx::query("DELETE FROM user_alter_relationships WHERE alter_id = ?")
            .bind(alter_id)
            .execute(&mut *tx)
            .await?;

        let mut rows_affected = delete_result.rows_affected();

        for rel in relationships {
            let id = Uuid::new_v4().to_string();
            let insert_result = sqlx::query(
                "INSERT INTO user_alter_relationships (id, user_id, alter_id, relationship_type) VALUES (?1, ?2, ?3, ?4)",
            )
            .bind(&id)
            .bind(&rel.user_id)
            .bind(&rel.alter_id)
            .bind(&rel.relationship_type)
            .execute(&mut *tx)
            .await?;
            rows_affected += insert_result.rows_affected();
        }

        tx.commit().await?;

        let relationships = self
            .list_user_alter_relationships_by_alter(alter_id)
            .await?;

        Ok((relationships, rows_affected))
    }

    async fn delete_user_alter_relationship(
        &self,
        user_id: &str,
        alter_id: &str,
        relationship_type: &str,
    ) -> Result<bool> {
        let result = sqlx::query("DELETE FROM user_alter_relationships WHERE user_id = ? AND alter_id = ? AND relationship_type = ?")
            .bind(user_id)
            .bind(alter_id)
            .bind(relationship_type)
            .execute(&self.pool)
            .await?;

        Ok(result.rows_affected() > 0)
    }

    async fn list_user_alter_relationships_by_alter(
        &self,
        alter_id: &str,
    ) -> Result<Vec<UserAlterRelationship>> {
        let relationships = sqlx::query_as::<_, UserAlterRelationship>(
            "SELECT uar.id, uar.user_id, uar.alter_id, uar.relationship_type, uar.created_at, u.username
             FROM user_alter_relationships uar
             JOIN users u ON uar.user_id = u.id
             WHERE uar.alter_id = ?
             ORDER BY uar.created_at DESC"
        )
        .bind(alter_id)
        .fetch_all(&self.pool)
        .await?;

        Ok(relationships)
    }

    async fn list_user_alter_relationships_by_user(
        &self,
        user_id: &str,
    ) -> Result<Vec<UserAlterRelationship>> {
        let relationships = sqlx::query_as::<_, UserAlterRelationship>(
            "SELECT uar.id, uar.user_id, uar.alter_id, uar.relationship_type, uar.created_at, u.username
             FROM user_alter_relationships uar
             JOIN users u ON uar.user_id = u.id
             WHERE uar.user_id = ?
             ORDER BY uar.created_at DESC"
        )
        .bind(user_id)
        .fetch_all(&self.pool)
        .await?;

        Ok(relationships)
    }

    async fn list_user_alter_relationships_by_type(
        &self,
        relationship_type: &str,
    ) -> Result<Vec<UserAlterRelationship>> {
        let relationships = sqlx::query_as::<_, UserAlterRelationship>(
            "SELECT uar.id, uar.user_id, uar.alter_id, uar.relationship_type, uar.created_at, u.username
             FROM user_alter_relationships uar
             JOIN users u ON uar.user_id = u.id
             WHERE uar.relationship_type = ?
             ORDER BY uar.created_at DESC"
        )
        .bind(relationship_type)
        .fetch_all(&self.pool)
        .await?;

        Ok(relationships)
    }

    async fn get_user_alter_relationship(
        &self,
        user_id: &str,
        alter_id: &str,
        relationship_type: &str,
    ) -> Result<Option<UserAlterRelationship>> {
        let relationship = sqlx::query_as::<_, UserAlterRelationship>("SELECT id, user_id, alter_id, relationship_type, created_at FROM user_alter_relationships WHERE user_id = ? AND alter_id = ? AND relationship_type = ?")
            .bind(user_id)
            .bind(alter_id)
            .bind(relationship_type)
            .fetch_optional(&self.pool)
            .await?;

        Ok(relationship)
    }
}
