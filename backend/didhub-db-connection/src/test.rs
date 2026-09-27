#[cfg(test)]
mod tests {
    use crate::config::{DEFAULT_MAX_CONNECTIONS, DEFAULT_MIN_CONNECTIONS};
    #[cfg(feature = "sqlite")]
    use crate::pool::SQLITE_MEMORY_PATTERNS;
    use crate::utils::{config_metadata, sanitize_database_url};
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
    fn test_url_sanitization_no_scheme() {
        // Test URLs without "://" scheme separator
        for raw in &["sqlite::memory:", "invalid_url", "just_string", ""] {
            let result = sanitize_database_url(raw);
            assert!(
                matches!(result, Cow::Borrowed(_)),
                "Expected Cow::Borrowed for {}",
                raw
            );
            assert_eq!(result.as_ref(), "<redacted>");
        }
    }

    #[test]
    fn test_url_sanitization_user_only_creds() {
        // Test URL with user-only credentials (no password)
        let url_with_user = "postgres://user@localhost:5432/mydb";
        let result = sanitize_database_url(url_with_user);
        assert!(matches!(result, Cow::Owned(_)));
        assert_eq!(result.as_ref(), "postgres://****:****@localhost:5432/mydb");
    }

    #[test]
    fn test_url_sanitization_without_path() {
        // Test URL with credentials but no trailing slash / path
        let url = "postgres://user:pass@localhost:5432";
        let result = sanitize_database_url(url);
        assert!(matches!(result, Cow::Owned(_)));
        assert_eq!(result.as_ref(), "postgres://****:****@localhost:5432");
    }

    #[test]
    fn test_url_sanitization_with_query_params() {
        // Test URL with credentials and query parameters
        let url = "postgres://admin:secret@127.0.0.1:5432/db?sslmode=require&connect_timeout=10";
        let result = sanitize_database_url(url);
        assert!(matches!(result, Cow::Owned(_)));
        assert_eq!(
            result.as_ref(),
            "postgres://****:****@127.0.0.1:5432/db?sslmode=require&connect_timeout=10"
        );
    }

    #[test]
    fn test_config_metadata_sanitizes_url() {
        let config = DbConnectionConfig::new("postgres://user:password@localhost:5432/mydb");
        let metadata = config_metadata(&config);

        assert_eq!(
            metadata["database_url"],
            "postgres://****:****@localhost:5432/mydb"
        );
        assert_eq!(metadata["max_connections"], DEFAULT_MAX_CONNECTIONS);
        assert_eq!(metadata["min_connections"], DEFAULT_MIN_CONNECTIONS);
        assert_eq!(metadata["connect_timeout_secs"], 30);
        assert_eq!(metadata["idle_timeout_secs"], 600);
        assert_eq!(metadata["test_before_acquire"], true);
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
}
