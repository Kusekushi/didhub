#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct CurrentUser {
    pub id: i64,
    pub username: String,
    pub avatar: Option<String>,
    pub is_admin: bool,
    pub is_system: bool,
    pub is_approved: bool,
    pub must_change_password: bool,
}

#[derive(Clone, Debug)]
pub struct AdminFlag;
