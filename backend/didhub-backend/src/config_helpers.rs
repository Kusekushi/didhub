use std::net::{IpAddr, Ipv6Addr, SocketAddr};

use axum::{http::StatusCode, response::Html, response::IntoResponse};
use didhub_db::DbConnectionConfig;
use didhub_log_client::LogToolClient;

/// Build database connection config from application config.
pub fn database_config_from_config(cfg: &didhub_config::Config) -> DbConnectionConfig {
    if let Some(path) = &cfg.database.path {
        return DbConnectionConfig::new(path);
    }
    match DbConnectionConfig::from_env("DIDHUB") {
        Ok(config) => config,
        Err(error) => {
            tracing::warn!(%error, "falling back to in-memory sqlite database");
            DbConnectionConfig::new("sqlite::memory:")
        }
    }
}

/// Build log client from application config.
pub fn log_client_from_config(cfg: &didhub_config::Config) -> LogToolClient {
    let log_dir = cfg
        .logging
        .log_dir
        .clone()
        .or_else(|| std::env::var("DIDHUB_LOG_DIR").ok())
        .unwrap_or_else(|| ".".into());
    LogToolClient::from_directory(log_dir)
}

/// Parse host:port into a SocketAddr, with fallback to 0.0.0.0.
pub fn parse_bind_address(host: &str, port: u16) -> SocketAddr {
    host.parse::<IpAddr>()
        .map(|ip| SocketAddr::new(ip, port))
        .or_else(|_| host.parse::<SocketAddr>())
        .or_else(|_| host.parse::<Ipv6Addr>().map(|ip| SocketAddr::new(IpAddr::V6(ip), port)))
        .unwrap_or_else(|_| SocketAddr::from(([0, 0, 0, 0], port)))
}

/// Fallback handler returning a maintenance HTML page with 503 status.
pub async fn service_unavailable_handler() -> impl IntoResponse {
    let body = Html(
        "<html><head><title>Service Unavailable</title></head>\
         <body><h1>Service Unavailable</h1>\
         <p>The service is currently undergoing maintenance or not properly configured. \
         Please try again later.</p></body></html>",
    );
    (StatusCode::SERVICE_UNAVAILABLE, body)
}
