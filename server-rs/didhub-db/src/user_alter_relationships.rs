use crate::common::CommonOperations;
use crate::models::{NewUserAlterRelationship, UserAlterRelationship};
use crate::Db;
use anyhow::Result;
use async_trait::async_trait;

#[async_trait]
pub trait UserAlterRelationshipOperations: Send + Sync {
    async fn create_user_alter_relationship(
        &self,
        relationship: &NewUserAlterRelationship,
    ) -> Result<UserAlterRelationship>;
    async fn delete_user_alter_relationship(
        &self,
        user_id: i64,
        alter_id: i64,
        relationship_type: &str,
    ) -> Result<bool>;
    async fn list_user_alter_relationships_by_alter(
        &self,
        alter_id: i64,
    ) -> Result<Vec<UserAlterRelationship>>;
    async fn list_user_alter_relationships_by_user(
        &self,
        user_id: i64,
    ) -> Result<Vec<UserAlterRelationship>>;
    async fn list_user_alter_relationships_by_type(
        &self,
        relationship_type: &str,
    ) -> Result<Vec<UserAlterRelationship>>;
    async fn get_user_alter_relationship(
        &self,
        user_id: i64,
        alter_id: i64,
        relationship_type: &str,
    ) -> Result<Option<UserAlterRelationship>>;
}

#[async_trait]
impl UserAlterRelationshipOperations for Db {
    async fn create_user_alter_relationship(
        &self,
        relationship: &NewUserAlterRelationship,
    ) -> Result<UserAlterRelationship> {
        let user_id = relationship.user_id;
        let alter_id = relationship.alter_id;
        let relationship_type = relationship.relationship_type.clone();

        let rec = self.insert_and_return(
            || async {
                sqlx::query("INSERT INTO user_alter_relationships (user_id, alter_id, relationship_type) VALUES (?1, ?2, ?3)")
                    .bind(user_id)
                    .bind(alter_id)
                    .bind(&relationship_type)
                    .execute(&self.pool)
                    .await?;
                let r = sqlx::query_as::<_, UserAlterRelationship>(
                    "SELECT uar.id, uar.user_id, uar.alter_id, uar.relationship_type, uar.created_at, u.username
                     FROM user_alter_relationships uar
                     JOIN users u ON uar.user_id = u.id
                     WHERE uar.id = LAST_INSERT_ID()"
                )
                .fetch_one(&self.pool)
                .await?;
                Ok(r)
            },
            || async {
                sqlx::query("INSERT INTO user_alter_relationships (user_id, alter_id, relationship_type) VALUES (?1, ?2, ?3)")
                    .bind(user_id)
                    .bind(alter_id)
                    .bind(&relationship_type)
                    .execute(&self.pool)
                    .await?;
                let r = sqlx::query_as::<_, UserAlterRelationship>(
                    "SELECT uar.id, uar.user_id, uar.alter_id, uar.relationship_type, uar.created_at, u.username
                     FROM user_alter_relationships uar
                     JOIN users u ON uar.user_id = u.id
                     WHERE uar.id = LAST_INSERT_ID()"
                )
                .fetch_one(&self.pool)
                .await?;
                Ok(r)
            }
        ).await?;

        Ok(rec)
    }

    async fn delete_user_alter_relationship(
        &self,
        user_id: i64,
        alter_id: i64,
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
        alter_id: i64,
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
        user_id: i64,
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
        user_id: i64,
        alter_id: i64,
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
