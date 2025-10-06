use serde::Deserialize;

/// Raw configuration file structure for JSON parsing
#[derive(Debug, Deserialize)]
pub struct RawConfigFile {
    #[serde(default)]
    pub database: Option<DatabaseSection>,
    #[serde(default)]
    pub server: Option<ServerSection>,
    #[serde(default)]
    pub logging: Option<LoggingSection>,
    #[serde(default)]
    pub cors: Option<CorsSection>,
    #[serde(default)]
    pub redis: Option<RedisSection>,
    #[serde(default)]
    pub uploads: Option<UploadsSection>,
    #[serde(default)]
    pub auto_update: Option<AutoUpdateSection>,
}

#[derive(Debug, Deserialize)]
pub struct LoggingSection {
    #[serde(default)]
    pub level: Option<String>,
    #[serde(default)]
    pub json: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct ServerSection {
    #[serde(default)]
    pub host: Option<String>,
    #[serde(default)]
    pub port: Option<u16>,
}

#[derive(Debug, Deserialize)]
pub struct CorsSection {
    #[serde(default)]
    pub allowed_origins: Option<Vec<String>>,
    #[serde(default)]
    pub allow_all_origins: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct RedisSection {
    #[serde(default)]
    pub url: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct DatabaseSection {
    pub driver: String,
    #[serde(default)]
    pub path: Option<String>,
    #[serde(default)]
    pub host: Option<String>,
    #[serde(default)]
    pub port: Option<u16>,
    #[serde(default)]
    pub database: Option<String>,
    #[serde(default)]
    pub username: Option<String>,
    #[serde(default)]
    pub password: Option<String>,
    #[serde(default)]
    pub ssl_mode: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UploadsSection {
    #[serde(default)]
    pub directory: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct AutoUpdateSection {
    #[serde(default)]
    pub enabled: Option<bool>,
    #[serde(default)]
    pub check_enabled: Option<bool>,
    #[serde(default)]
    pub repo: Option<String>,
    #[serde(default)]
    pub check_interval_hours: Option<u64>,
}