#[cfg(test)]
mod tests {
    use crate::config::{DEFAULT_MAX_CONNECTIONS, DEFAULT_MIN_CONNECTIONS};
    #[cfg(feature = "sqlite")]
    use crate::pool::SQLITE_MEMORY_PATTERNS;
    use crate::utils::sanitize_database_url;
    use crate::*;
    use std::borrow::Cow;

    #[test]
    fn test_config_creation() {
        let config = DbConnectionConfig::new("sqlite::memory:");
        assert_eq!(config.url, "sqlite::memory:");
        assert_eq!(config.max_connections, DEFAULT_MAX_CONNECTIONS);
        assert_eq!(config.min_connections, DEFAULT_MIN_CONNECTIONS);
    }

    #[test]
    fn test_url_sanitization_no_creds() {
        // Test URL without credentials (should return as-is with Cow::Borrowed)
        let url = "postgres://localhost:5432/mydb";
        let result = sanitize_database_url(url);
        assert!(matches!(result, Cow::Borrowed(_)));
        assert_eq!(result.as_ref(), url);
    }

    #[test]
    fn test_url_sanitization_with_creds() {
        // Test URL with credentials (should allocate and redact)
        let url_with_creds = "postgres://user:pass@localhost:5432/mydb";
        let result = sanitize_database_url(url_with_creds);
        assert!(matches!(result, Cow::Owned(_)));
        assert_eq!(result.as_ref(), "postgres://****:****@localhost:5432/mydb");
    }

    #[test]
    fn test_sqlite_memory_detection() {
        // Test memory patterns
        let url_bytes = b":memory:";
        let found = SQLITE_MEMORY_PATTERNS.iter().any(|&pattern| {
            url_bytes
                .windows(pattern.len())
                .any(|w| w.eq_ignore_ascii_case(pattern))
        });
        assert!(found);

        let url_bytes = b"mode=memory";
        let found = SQLITE_MEMORY_PATTERNS.iter().any(|&pattern| {
            url_bytes
                .windows(pattern.len())
                .any(|w| w.eq_ignore_ascii_case(pattern))
        });
        assert!(found);
    }

    #[test]
    fn test_const_timeout() {
        let config = DbConnectionConfig {
            connect_timeout_secs: 42,
            ..Default::default()
        };
        // Test that connect_timeout works as expected
        assert_eq!(config.connect_timeout(), std::time::Duration::from_secs(42));
    }

    #[test]
    fn test_from_env_missing_database_url() {
        let prefix = "TEST_MISSING_URL_ENV";
        let res = DbConnectionConfig::from_env(prefix);
        assert!(matches!(res, Err(DbConnectionError::MissingEnvVar(v)) if v == "TEST_MISSING_URL_ENV_DATABASE_URL"));
    }

    #[test]
    fn test_from_env_empty_database_url() {
        let prefix = "TEST_EMPTY_URL_ENV";
        std::env::set_var(format!("{prefix}_DATABASE_URL"), "   ");
        let res = DbConnectionConfig::from_env(prefix);
        assert!(matches!(res, Err(DbConnectionError::EmptyDatabaseUrl)));
        std::env::remove_var(format!("{prefix}_DATABASE_URL"));
    }

    #[test]
    fn test_from_env_defaults() {
        let prefix = "TEST_DEFAULTS_ENV";
        std::env::set_var(format!("{prefix}_DATABASE_URL"), "postgres://localhost/mydb");

        let config = DbConnectionConfig::from_env(prefix).expect("should load config successfully");
        assert_eq!(config.url, "postgres://localhost/mydb");
        assert_eq!(config.max_connections, DEFAULT_MAX_CONNECTIONS);
        assert_eq!(config.min_connections, DEFAULT_MIN_CONNECTIONS);
        assert_eq!(config.connect_timeout_secs, 30);
        assert_eq!(config.idle_timeout_secs, Some(600));
        assert_eq!(config.idle_timeout(), Some(std::time::Duration::from_secs(600)));
        assert!(config.test_before_acquire);

        std::env::remove_var(format!("{prefix}_DATABASE_URL"));
    }

    #[test]
    fn test_from_env_custom_valid_values() {
        let prefix = "TEST_CUSTOM_ENV";
        std::env::set_var(format!("{prefix}_DATABASE_URL"), "sqlite::memory:");
        std::env::set_var(format!("{prefix}_DB_MAX_CONNECTIONS"), "20");
        std::env::set_var(format!("{prefix}_DB_MIN_CONNECTIONS"), "5");
        std::env::set_var(format!("{prefix}_DB_CONNECT_TIMEOUT_SECS"), "15");
        std::env::set_var(format!("{prefix}_DB_IDLE_TIMEOUT_SECS"), "120");
        std::env::set_var(format!("{prefix}_DB_TEST_BEFORE_ACQUIRE"), "false");

        let config = DbConnectionConfig::from_env(prefix).expect("should load config");
        assert_eq!(config.url, "sqlite::memory:");
        assert_eq!(config.max_connections, 20);
        assert_eq!(config.min_connections, 5);
        assert_eq!(config.connect_timeout_secs, 15);
        assert_eq!(config.idle_timeout_secs, Some(120));
        assert!(!config.test_before_acquire);

        // Test bool truthy variants (1, true, yes, on, etc.)
        std::env::set_var(format!("{prefix}_DB_TEST_BEFORE_ACQUIRE"), "yes");
        let config2 = DbConnectionConfig::from_env(prefix).expect("should load config");
        assert!(config2.test_before_acquire);

        std::env::remove_var(format!("{prefix}_DATABASE_URL"));
        std::env::remove_var(format!("{prefix}_DB_MAX_CONNECTIONS"));
        std::env::remove_var(format!("{prefix}_DB_MIN_CONNECTIONS"));
        std::env::remove_var(format!("{prefix}_DB_CONNECT_TIMEOUT_SECS"));
        std::env::remove_var(format!("{prefix}_DB_IDLE_TIMEOUT_SECS"));
        std::env::remove_var(format!("{prefix}_DB_TEST_BEFORE_ACQUIRE"));
    }

    #[test]
    fn test_from_env_validation_errors() {
        let prefix = "TEST_VALIDATION_ENV";
        std::env::set_var(format!("{prefix}_DATABASE_URL"), "postgres://localhost/mydb");

        // max_connections = 0
        std::env::set_var(format!("{prefix}_DB_MAX_CONNECTIONS"), "0");
        let res = DbConnectionConfig::from_env(prefix);
        assert!(matches!(
            res,
            Err(DbConnectionError::InvalidBoolean { ref var, ref value })
                if var == &format!("{prefix}_DB_MAX_CONNECTIONS")
                    && value == "max_connections must be greater than 0"
        ));

        // min_connections > max_connections
        std::env::set_var(format!("{prefix}_DB_MAX_CONNECTIONS"), "5");
        std::env::set_var(format!("{prefix}_DB_MIN_CONNECTIONS"), "10");
        let res = DbConnectionConfig::from_env(prefix);
        assert!(matches!(
            res,
            Err(DbConnectionError::InvalidBoolean { ref var, ref value })
                if var == &format!("{prefix}_DB_MIN_CONNECTIONS")
                    && value == "min_connections must not exceed max_connections"
        ));

        std::env::remove_var(format!("{prefix}_DATABASE_URL"));
        std::env::remove_var(format!("{prefix}_DB_MAX_CONNECTIONS"));
        std::env::remove_var(format!("{prefix}_DB_MIN_CONNECTIONS"));
    }

    #[test]
    fn test_from_env_invalid_number_and_bool() {
        let prefix = "TEST_INVALID_PARSE_ENV";
        std::env::set_var(format!("{prefix}_DATABASE_URL"), "postgres://localhost/mydb");

        // Invalid u32
        std::env::set_var(format!("{prefix}_DB_MAX_CONNECTIONS"), "not_a_number");
        let res = DbConnectionConfig::from_env(prefix);
        assert!(matches!(res, Err(DbConnectionError::InvalidNumber { ref var, .. }) if var == &format!("{prefix}_DB_MAX_CONNECTIONS")));
        std::env::remove_var(format!("{prefix}_DB_MAX_CONNECTIONS"));

        // Invalid bool
        std::env::set_var(format!("{prefix}_DB_TEST_BEFORE_ACQUIRE"), "maybe");
        let res = DbConnectionConfig::from_env(prefix);
        assert!(matches!(res, Err(DbConnectionError::InvalidBoolean { ref var, ref value }) if var == &format!("{prefix}_DB_TEST_BEFORE_ACQUIRE") && value == "maybe"));
        std::env::remove_var(format!("{prefix}_DB_TEST_BEFORE_ACQUIRE"));

        std::env::remove_var(format!("{prefix}_DATABASE_URL"));
    }

    #[test]
    fn test_from_env_heap_fallback_long_prefix() {
        // Prefix length > 64 byte buffer when combined with suffix
        let prefix = "VERY_LONG_PREFIX_NAME_THAT_EXCEEDS_STACK_BUFFER_SIZE_LIMIT_FOR_VAR_NAME_ALLOCATION";
        std::env::set_var(format!("{prefix}_DATABASE_URL"), "postgres://localhost/mydb");
        std::env::set_var(format!("{prefix}_DB_MAX_CONNECTIONS"), "15");
        std::env::set_var(format!("{prefix}_DB_TEST_BEFORE_ACQUIRE"), "true");

        let config = DbConnectionConfig::from_env(prefix).expect("heap fallback should succeed");
        assert_eq!(config.max_connections, 15);
        assert!(config.test_before_acquire);

        // Test heap fallback invalid number
        std::env::set_var(format!("{prefix}_DB_MAX_CONNECTIONS"), "invalid");
        let res = DbConnectionConfig::from_env(prefix);
        assert!(matches!(res, Err(DbConnectionError::InvalidNumber { .. })));

        // Test heap fallback invalid bool
        std::env::remove_var(format!("{prefix}_DB_MAX_CONNECTIONS"));
        std::env::set_var(format!("{prefix}_DB_TEST_BEFORE_ACQUIRE"), "invalid_bool");
        let res = DbConnectionConfig::from_env(prefix);
        assert!(matches!(res, Err(DbConnectionError::InvalidBoolean { .. })));

        std::env::remove_var(format!("{prefix}_DATABASE_URL"));
        std::env::remove_var(format!("{prefix}_DB_MAX_CONNECTIONS"));
        std::env::remove_var(format!("{prefix}_DB_TEST_BEFORE_ACQUIRE"));
    }
}
