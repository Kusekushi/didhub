use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Post {
    pub id: String,
    pub body: String,
    pub created_by_user_id: Option<String>,
    pub repost_of_post_id: Option<String>,
    pub created_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct User {
    pub id: String,
    pub username: String,
    pub email: Option<String>,
    pub password_hash: Option<String>,
    pub avatar: Option<String>,
    pub is_system: i64,
    pub is_admin: i64,
    pub is_approved: i64,
    pub must_change_password: i64,
    pub created_at: String,
    pub updated_at: Option<String>,
    pub roles: String,
    pub settings: String,
    pub is_active: i64,
    pub email_verified: i64,
    pub last_login_at: Option<String>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum DbBackend {
    Sqlite,
    Postgres,
    MySql,
}

#[derive(Clone)]
pub struct Db {
    pub pool: sqlx::AnyPool,
    pub backend: DbBackend,
    pub url: String,
}

#[derive(serde::Serialize)]
pub struct SystemSummary {
    pub user_id: String,
    pub username: String,
    pub avatar: Option<String>,
    pub alters: i64,
    pub groups: i64,
    pub subsystems: i64,
}

#[derive(serde::Serialize)]
pub struct SystemDetail {
    pub user_id: String,
    pub username: String,
    pub alters: Vec<String>,
    pub groups: Vec<String>,
    pub subsystems: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Group {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub avatar_url: Option<String>,
    pub banner_url: Option<String>,
    pub color: Option<String>,
    pub sigil: Option<String>,
    pub leaders: Option<String>,
    pub metadata: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub owner_user_id: Option<String>,
    pub is_public: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Subsystem {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub avatar_url: Option<String>,
    pub banner_url: Option<String>,
    pub color: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub owner_user_id: Option<String>,
    pub is_public: bool,
    pub leaders: Option<String>,
    pub metadata: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct SystemRequest {
    pub id: String,
    pub user_id: String,
    pub status: String,
    pub note: Option<String>,
    pub decided_at: Option<String>,
    pub created_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct SystemRequestAdmin {
    pub id: String,
    pub user_id: String,
    pub username: String,
    pub status: String,
    pub note: Option<String>,
    pub decided_at: Option<String>,
    pub created_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Setting {
    pub key: String,
    pub value: String,
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct AuditLog {
    pub id: String,
    pub created_at: Option<String>,
    pub user_id: Option<String>,
    pub action: String,
    pub entity_type: Option<String>,
    pub entity_id: Option<String>,
    pub ip: Option<String>,
    pub metadata: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct HousekeepingRun {
    pub id: String,
    pub job_name: String,
    pub started_at: String,
    pub finished_at: Option<String>,
    pub status: String,
    pub message: Option<String>,
    pub rows_affected: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct PasswordResetToken {
    pub id: String,
    pub selector: String,
    pub verifier_hash: String,
    pub user_id: String,
    pub expires_at: String,
    pub used_at: Option<String>,
    pub created_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct NewUser {
    pub username: String,
    pub password_hash: String,
    pub is_system: bool,
    pub is_approved: bool,
}

#[derive(Debug)]
pub struct UserListFilters {
    pub q: Option<String>,
    pub is_admin: Option<bool>,
    pub is_system: Option<bool>,
    pub is_approved: Option<bool>,
    pub sort_by: String,
    pub order_desc: bool,
    pub limit: i64,
    pub offset: i64,
}

#[derive(Debug, Default)]
pub struct UpdateUserFields {
    pub password_hash: Option<String>,
    pub is_system: Option<bool>,
    pub is_admin: Option<bool>,
    pub is_approved: Option<bool>,
    pub must_change_password: Option<bool>,
    pub avatar: Option<Option<String>>, // Some(Some(val)) set, Some(None) clear, None ignore
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Alter {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub age: Option<String>,
    pub gender: Option<String>,
    pub pronouns: Option<String>,
    pub birthday: Option<String>,
    pub sexuality: Option<String>,
    pub species: Option<String>,
    pub alter_type: Option<String>,
    pub job: Option<String>,
    pub weapon: Option<String>,
    pub triggers: Option<String>,
    pub metadata: Option<String>,
    pub soul_songs: Option<String>,
    pub interests: Option<String>,
    pub notes: Option<String>,
    pub images: Option<String>,
    pub subsystem: Option<String>,
    pub system_roles: Option<String>,
    pub is_system_host: i64,
    pub is_dormant: i64,
    pub is_merged: i64,
    pub owner_user_id: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct NewAlter {
    pub name: String,
    pub owner_user_id: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, sqlx::FromRow)]
pub struct UploadRow {
    pub id: String,
    pub stored_name: String,
    pub original_name: Option<String>,
    pub user_id: Option<String>,
    pub mime: Option<String>,
    pub bytes: Option<i64>,
    pub hash: Option<String>,
    pub created_at: Option<String>,
    pub deleted_at: Option<String>,
}

#[derive(Debug, Clone)]
pub struct NewUpload<'a> {
    pub stored_name: &'a str,
    pub original_name: Option<&'a str>,
    pub user_id: Option<String>,
    pub mime: Option<&'a str>,
    pub bytes: i64,
    pub hash: Option<&'a str>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct UserAlterRelationship {
    pub id: String,
    pub user_id: String,
    pub alter_id: String,
    pub relationship_type: String,
    pub created_at: Option<String>,
    pub username: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewUserAlterRelationship {
    pub user_id: String,
    pub alter_id: String,
    pub relationship_type: String,
}
