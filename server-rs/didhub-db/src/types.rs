#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct CurrentUser {
    pub id: String,
    pub username: String,
    pub avatar: Option<String>,
    pub is_admin: i64,
    pub is_system: i64,
    pub is_approved: i64,
    pub must_change_password: i64,
}

#[derive(Clone, Debug)]
pub struct AdminFlag;
