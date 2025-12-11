use std::env::{self, VarError};
use std::num::ParseIntError;
use std::time::Duration;

use serde::Deserialize;

use crate::error::DbConnectionError;

pub const DEFAULT_MAX_CONNECTIONS: u32 = 10;
pub const DEFAULT_MIN_CONNECTIONS: u32 = 1;
const DEFAULT_CONNECT_TIMEOUT_SECS: u64 = 30;
const DEFAULT_IDLE_TIMEOUT_SECS: u64 = 600;
const DEFAULT_TEST_BEFORE_ACQUIRE: bool = true;

/// Basic configuration for creating a SQLx connection pool.
#[derive(Debug, Clone, Deserialize)]
#[serde(default)]
pub struct DbConnectionConfig {
    pub url: String,
    pub max_connections: u32,
    pub min_connections: u32,
    pub connect_timeout_secs: u64,
    pub idle_timeout_secs: Option<u64>,
    pub test_before_acquire: bool,
}

impl Default for DbConnectionConfig {
    #[inline]
    fn default() -> Self {
        Self {
            url: String::new(),
            max_connections: DEFAULT_MAX_CONNECTIONS,
            min_connections: DEFAULT_MIN_CONNECTIONS,
            connect_timeout_secs: DEFAULT_CONNECT_TIMEOUT_SECS,
            idle_timeout_secs: Some(DEFAULT_IDLE_TIMEOUT_SECS),
            test_before_acquire: DEFAULT_TEST_BEFORE_ACQUIRE,
        }
    }
}

impl DbConnectionConfig {
    /// Creates a new configuration with the provided URL and sane defaults.
    #[inline]
    pub fn new(url: impl Into<String>) -> Self {
        Self {
            url: url.into(),
            ..Self::default()
        }
    }

    /// Loads configuration from environment variables using the supplied prefix.
    ///
    /// Expected variables:
    /// - `{PREFIX}_DATABASE_URL` (required)
    /// - `{PREFIX}_DB_MAX_CONNECTIONS` (optional)
    /// - `{PREFIX}_DB_MIN_CONNECTIONS` (optional)
    /// - `{PREFIX}_DB_CONNECT_TIMEOUT_SECS` (optional)
    /// - `{PREFIX}_DB_IDLE_TIMEOUT_SECS` (optional)
    /// - `{PREFIX}_DB_TEST_BEFORE_ACQUIRE` (optional, bool)
    pub fn from_env(prefix: &str) -> Result<Self, DbConnectionError> {
        let url_var = format!("{}_DATABASE_URL", prefix);
        let url =
            env::var(&url_var).map_err(|_| DbConnectionError::MissingEnvVar(url_var.clone()))?;
        if url.trim().is_empty() {
            return Err(DbConnectionError::EmptyDatabaseUrl);
        }

        let mut config = Self::new(url);

        if let Some(max) = maybe_parse_u32(prefix, "DB_MAX_CONNECTIONS")? {
            config.max_connections = max;
        }
        if let Some(min) = maybe_parse_u32(prefix, "DB_MIN_CONNECTIONS")? {
            config.min_connections = min;
        }

        // Validate connection pool configuration
        if config.max_connections == 0 {
            return Err(DbConnectionError::InvalidBoolean {
                var: format!("{prefix}_DB_MAX_CONNECTIONS"),
                value: "max_connections must be greater than 0".to_owned(),
            });
        }
        if config.min_connections > config.max_connections {
            return Err(DbConnectionError::InvalidBoolean {
                var: format!("{prefix}_DB_MIN_CONNECTIONS"),
                value: "min_connections must not exceed max_connections".to_owned(),
            });
        }
        if let Some(connect_timeout) = maybe_parse_u64(prefix, "DB_CONNECT_TIMEOUT_SECS")? {
            config.connect_timeout_secs = connect_timeout;
        }
        if let Some(idle_timeout) = maybe_parse_u64(prefix, "DB_IDLE_TIMEOUT_SECS")? {
            config.idle_timeout_secs = Some(idle_timeout);
        }
        if let Some(value) = maybe_parse_bool(prefix, "DB_TEST_BEFORE_ACQUIRE")? {
            config.test_before_acquire = value;
        }

        Ok(config)
    }

    #[inline]
    pub const fn connect_timeout(&self) -> Duration {
        Duration::from_secs(self.connect_timeout_secs)
    }

    #[inline]
    pub fn idle_timeout(&self) -> Option<Duration> {
        match self.idle_timeout_secs {
            Some(secs) => Some(Duration::from_secs(secs)),
            None => None,
        }
    }
}

fn maybe_parse_u32(prefix: &str, suffix: &str) -> Result<Option<u32>, DbConnectionError> {
    maybe_parse_env(prefix, suffix, str::parse)
}

fn maybe_parse_u64(prefix: &str, suffix: &str) -> Result<Option<u64>, DbConnectionError> {
    maybe_parse_env(prefix, suffix, str::parse)
}

fn maybe_parse_env<T, E>(
    prefix: &str,
    suffix: &str,
    parser: fn(&str) -> Result<T, E>,
) -> Result<Option<T>, DbConnectionError>
where
    E: Into<ParseIntError>,
{
    // Use stack-allocated buffer for most common variable names
    let mut var_name_buf = [0u8; 64];
    let var_name = if prefix.len() + suffix.len() + 1 <= var_name_buf.len() {
        let len = prefix.len() + 1 + suffix.len();
        var_name_buf[..prefix.len()].copy_from_slice(prefix.as_bytes());
        var_name_buf[prefix.len()] = b'_';
        var_name_buf[prefix.len() + 1..len].copy_from_slice(suffix.as_bytes());
        std::str::from_utf8(&var_name_buf[..len]).unwrap()
    } else {
        // Fallback to heap allocation for very long names
        return maybe_parse_env_heap_fallback(prefix, suffix, parser);
    };

    match env::var(var_name) {
        Ok(value) => {
            let trimmed = value.trim();
            if trimmed.is_empty() {
                Ok(None)
            } else {
                parser(trimmed).map(Some).map_err(|e| DbConnectionError::InvalidNumber {
                    var: var_name.to_owned(),
                    source: e.into(),
                })
            }
        }
        Err(VarError::NotPresent) => Ok(None),
        Err(VarError::NotUnicode(_)) => Err(DbConnectionError::InvalidUnicode(var_name.to_owned())),
    }
}

#[cold]
fn maybe_parse_env_heap_fallback<T, E>(
    prefix: &str,
    suffix: &str,
    parser: fn(&str) -> Result<T, E>,
) -> Result<Option<T>, DbConnectionError>
where
    E: Into<ParseIntError>,
{
    let var_name = format!("{prefix}_{suffix}");
    match env::var(&var_name) {
        Ok(value) => {
            let trimmed = value.trim();
            if trimmed.is_empty() {
                Ok(None)
            } else {
                parser(trimmed).map(Some).map_err(|e| DbConnectionError::InvalidNumber {
                    var: var_name,
                    source: e.into(),
                })
            }
        }
        Err(VarError::NotPresent) => Ok(None),
        Err(VarError::NotUnicode(_)) => Err(DbConnectionError::InvalidUnicode(var_name)),
    }
}

fn maybe_parse_bool(prefix: &str, suffix: &str) -> Result<Option<bool>, DbConnectionError> {
    // Use stack-allocated buffer for most common variable names
    let mut var_name_buf = [0u8; 64];
    let var_name = if prefix.len() + suffix.len() + 1 <= var_name_buf.len() {
        let len = prefix.len() + 1 + suffix.len();
        var_name_buf[..prefix.len()].copy_from_slice(prefix.as_bytes());
        var_name_buf[prefix.len()] = b'_';
        var_name_buf[prefix.len() + 1..len].copy_from_slice(suffix.as_bytes());
        std::str::from_utf8(&var_name_buf[..len]).unwrap()
    } else {
        // Fallback to heap allocation for very long names
        return maybe_parse_bool_heap_fallback(prefix, suffix);
    };

    match env::var(var_name) {
        Ok(value) => {
            let trimmed = value.trim();
            if trimmed.is_empty() {
                return Ok(None);
            }
            match trimmed.as_bytes() {
                b"1" | b"true" | b"TRUE" | b"yes" | b"YES" | b"on" | b"ON" => Ok(Some(true)),
                b"0" | b"false" | b"FALSE" | b"no" | b"NO" | b"off" | b"OFF" => Ok(Some(false)),
                _ => Err(DbConnectionError::InvalidBoolean {
                    var: var_name.to_owned(),
                    value: trimmed.to_owned(),
                }),
            }
        }
        Err(VarError::NotPresent) => Ok(None),
        Err(VarError::NotUnicode(_)) => Err(DbConnectionError::InvalidUnicode(var_name.to_owned())),
    }
}

#[cold]
fn maybe_parse_bool_heap_fallback(prefix: &str, suffix: &str) -> Result<Option<bool>, DbConnectionError> {
    let var_name = format!("{prefix}_{suffix}");
    match env::var(&var_name) {
        Ok(value) => {
            let trimmed = value.trim();
            if trimmed.is_empty() {
                return Ok(None);
            }
            match trimmed.as_bytes() {
                b"1" | b"true" | b"TRUE" | b"yes" | b"YES" | b"on" | b"ON" => Ok(Some(true)),
                b"0" | b"false" | b"FALSE" | b"no" | b"NO" | b"off" | b"OFF" => Ok(Some(false)),
                _ => Err(DbConnectionError::InvalidBoolean {
                    var: var_name.clone(),
                    value: trimmed.to_owned(),
                }),
            }
        }
        Err(VarError::NotPresent) => Ok(None),
        Err(VarError::NotUnicode(_)) => Err(DbConnectionError::InvalidUnicode(var_name)),
    }
}