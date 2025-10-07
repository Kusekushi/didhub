//! Utility functions for middleware.
//!
//! This module provides utility functions that are commonly used
//! in middleware implementations.

use axum::http::{HeaderMap, Method};

/// Check if an HTTP method is considered "safe" (read-only).
///
/// Safe methods are defined in RFC 7231 as methods that are
/// inherently read-only and don't modify server state.
pub fn is_safe_method(method: &Method) -> bool {
    matches!(
        *method,
        Method::GET | Method::HEAD | Method::OPTIONS | Method::TRACE
    )
}

/// Check if an HTTP method is considered "idempotent".
///
/// Idempotent methods can be called multiple times without
/// changing the result beyond the initial call.
pub fn is_idempotent_method(method: &Method) -> bool {
    matches!(
        *method,
        Method::GET | Method::HEAD | Method::OPTIONS | Method::TRACE | Method::PUT | Method::DELETE
    )
}

/// Extract the first value of a header from a HeaderMap.
pub fn get_header_value<'a>(headers: &'a HeaderMap, name: &str) -> Option<&'a str> {
    headers.get(name)?.to_str().ok()
}

/// Check if a request path matches any of the given patterns.
///
/// Patterns can include wildcards (*) for path segments.
pub fn path_matches_any(path: &str, patterns: &[&str]) -> bool {
    for pattern in patterns {
        if path_matches_pattern(path, pattern) {
            return true;
        }
    }
    false
}

/// Check if a request path matches a pattern with wildcards.
pub fn path_matches_pattern(path: &str, pattern: &str) -> bool {
    if pattern == "*" {
        return true;
    }

    let path_parts: Vec<&str> = path.trim_start_matches('/').split('/').collect();
    let pattern_parts: Vec<&str> = pattern.trim_start_matches('/').split('/').collect();

    if path_parts.len() != pattern_parts.len() {
        return false;
    }

    for (path_part, pattern_part) in path_parts.iter().zip(pattern_parts.iter()) {
        if *pattern_part == "*" {
            continue;
        }
        if path_part != pattern_part {
            return false;
        }
    }

    true
}

/// Generate a cache key for a request based on method and path.
pub fn generate_cache_key(method: &Method, path: &str) -> String {
    format!("{}:{}", method.as_str(), path)
}

/// Check if a user agent string indicates a bot or crawler.
pub fn is_bot_user_agent(user_agent: &str) -> bool {
    let bot_indicators = [
        "bot",
        "crawler",
        "spider",
        "scraper",
        "indexer",
        "archive",
        "googlebot",
        "bingbot",
        "slurp",
        "duckduckbot",
        "baiduspider",
        "yandexbot",
        "sogou",
        "exabot",
        "facebot",
        "ia_archiver",
    ];

    let ua_lower = user_agent.to_lowercase();
    bot_indicators.iter().any(|&bot| ua_lower.contains(bot))
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::Method;

    #[test]
    fn test_is_safe_method() {
        assert!(is_safe_method(&Method::GET));
        assert!(is_safe_method(&Method::HEAD));
        assert!(is_safe_method(&Method::OPTIONS));
        assert!(is_safe_method(&Method::TRACE));

        assert!(!is_safe_method(&Method::POST));
        assert!(!is_safe_method(&Method::PUT));
        assert!(!is_safe_method(&Method::DELETE));
        assert!(!is_safe_method(&Method::PATCH));
    }

    #[test]
    fn test_is_idempotent_method() {
        assert!(is_idempotent_method(&Method::GET));
        assert!(is_idempotent_method(&Method::HEAD));
        assert!(is_idempotent_method(&Method::OPTIONS));
        assert!(is_idempotent_method(&Method::TRACE));
        assert!(is_idempotent_method(&Method::PUT));
        assert!(is_idempotent_method(&Method::DELETE));

        assert!(!is_idempotent_method(&Method::POST));
        assert!(!is_idempotent_method(&Method::PATCH));
    }

    #[test]
    fn test_path_matches_pattern() {
        assert!(path_matches_pattern("/api/users", "/api/users"));
        assert!(path_matches_pattern("/api/users/123", "/api/users/*"));
        assert!(path_matches_pattern(
            "/api/users/123/profile",
            "/api/users/*/profile"
        ));
        assert!(!path_matches_pattern("/api/posts", "/api/users"));
        assert!(!path_matches_pattern("/api/users", "/api/users/*"));
    }

    #[test]
    fn test_path_matches_any() {
        let patterns = vec!["/api/users", "/api/posts/*"];
        assert!(path_matches_any("/api/users", &patterns));
        assert!(path_matches_any("/api/posts/123", &patterns));
        assert!(!path_matches_any("/api/comments", &patterns));
    }

    #[test]
    fn test_is_bot_user_agent() {
        assert!(is_bot_user_agent(
            "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"
        ));
        assert!(!is_bot_user_agent("curl/7.68.0"));
        assert!(!is_bot_user_agent(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        ));
    }
}
