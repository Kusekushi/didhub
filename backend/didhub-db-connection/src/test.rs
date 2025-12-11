#[cfg(test)]
mod tests {
    use crate::*;
    use crate::config::{DEFAULT_MAX_CONNECTIONS, DEFAULT_MIN_CONNECTIONS};
    use crate::utils::sanitize_database_url;
    #[cfg(feature = "sqlite")]
    use crate::pool::SQLITE_MEMORY_PATTERNS;
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
            url_bytes.windows(pattern.len()).any(|w| w.eq_ignore_ascii_case(pattern))
        });
        assert!(found);
        
        let url_bytes = b"mode=memory";
        let found = SQLITE_MEMORY_PATTERNS.iter().any(|&pattern| {
            url_bytes.windows(pattern.len()).any(|w| w.eq_ignore_ascii_case(pattern))
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