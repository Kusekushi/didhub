#[derive(serde::Deserialize)]
pub struct Login {
    pub username: String,
    /// SHA-256 hash of the password (64 hex characters)
    #[serde(alias = "password")]
    pub password_hash: String,
}
