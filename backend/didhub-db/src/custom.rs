// Custom database query functions that extend the generated code
// These functions provide common queries that are not auto-generated

use crate::DbBackend;
use sqlx::Executor;

pub mod users {
    use super::*;

    pub async fn find_by_id_partial<'e, E>(
        executor: E,
        user_id: &uuid::Uuid,
    ) -> Result<Option<(String, Option<String>, String)>, sqlx::Error>
    where
        E: Executor<'e, Database = DbBackend>,
    {
        sqlx::query_as("SELECT username, avatar, roles FROM users WHERE id = ?")
            .bind(user_id)
            .fetch_optional(executor)
            .await
    }
}

pub mod affiliation_members {
    use super::*;
    use crate::generated::affiliation_members as db_affiliation_members;

    #[derive(Debug, serde::Serialize, serde::Deserialize, sqlx::FromRow)]
    pub struct AffiliationWithMemberInfo {
        pub id: uuid::Uuid,
        pub name: String,
        pub description: Option<String>,
        pub sigil: Option<String>,
        pub is_leader: i32,
        pub added_at: String,
    }

    pub async fn find_by_affiliation_id_and_alter_id<'e, E>(
        executor: E,
        affiliation_id: &uuid::Uuid,
        alter_id: &uuid::Uuid,
    ) -> Result<Option<db_affiliation_members::AffiliationMembersRow>, sqlx::Error>
    where
        E: Executor<'e, Database = DbBackend>,
    {
        sqlx::query_as::<_, db_affiliation_members::AffiliationMembersRow>(
            "SELECT affiliation_id, alter_id, is_leader, added_at FROM affiliation_members WHERE affiliation_id = ? AND alter_id = ?"
        )
        .bind(affiliation_id)
        .bind(alter_id)
        .fetch_optional(executor)
        .await
    }

    pub async fn find_affiliations_for_alter<'e, E>(
        executor: E,
        alter_id: &uuid::Uuid,
    ) -> Result<Vec<AffiliationWithMemberInfo>, sqlx::Error>
    where
        E: Executor<'e, Database = DbBackend>,
    {
        sqlx::query_as::<_, AffiliationWithMemberInfo>(
            r#"
            SELECT a.id, a.name, a.description, a.sigil, am.is_leader, am.added_at
            FROM affiliations a
            INNER JOIN affiliation_members am ON a.id = am.affiliation_id
            WHERE am.alter_id = ?
            ORDER BY a.name
            "#,
        )
        .bind(alter_id)
        .fetch_all(executor)
        .await
    }
}

pub mod subsystem_members {
    use super::*;
    use crate::generated::subsystem_members as db_subsystem_members;

    pub async fn find_by_subsystem_id_and_alter_id<'e, E>(
        executor: E,
        subsystem_id: &uuid::Uuid,
        alter_id: &uuid::Uuid,
    ) -> Result<Option<db_subsystem_members::SubsystemMembersRow>, sqlx::Error>
    where
        E: Executor<'e, Database = DbBackend>,
    {
        sqlx::query_as::<_, db_subsystem_members::SubsystemMembersRow>(
            "SELECT subsystem_id, alter_id, is_host, added_at FROM subsystem_members WHERE subsystem_id = ? AND alter_id = ?"
        )
        .bind(subsystem_id)
        .bind(alter_id)
        .fetch_optional(executor)
        .await
    }

    #[derive(Debug, serde::Serialize, serde::Deserialize, sqlx::FromRow)]
    pub struct SubsystemWithMemberInfo {
        pub id: uuid::Uuid,
        pub name: String,
        pub is_host: i32,
        pub added_at: String,
    }

    pub async fn find_subsystem_for_alter<'e, E>(
        executor: E,
        alter_id: &uuid::Uuid,
    ) -> Result<Option<SubsystemWithMemberInfo>, sqlx::Error>
    where
        E: Executor<'e, Database = DbBackend>,
    {
        sqlx::query_as::<_, SubsystemWithMemberInfo>(
            r#"
            SELECT s.id, s.name, sm.is_host, sm.added_at
            FROM subsystems s
            INNER JOIN subsystem_members sm ON s.id = sm.subsystem_id
            WHERE sm.alter_id = ?
            "#,
        )
        .bind(alter_id)
        .fetch_optional(executor)
        .await
    }
}
