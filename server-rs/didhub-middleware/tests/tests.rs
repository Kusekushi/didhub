use didhub_middleware::csrf::{build_cookie, generate_token, is_allowlisted, is_safe_method};
use didhub_middleware::utils::*;

#[cfg(test)]
mod csrf_tests {
    use super::*;

    #[test]
    fn test_is_safe_method() {
        assert!(is_safe_method("GET"));
        assert!(is_safe_method("HEAD"));
        assert!(is_safe_method("OPTIONS"));
        assert!(is_safe_method("TRACE"));

        assert!(!is_safe_method("POST"));
        assert!(!is_safe_method("PUT"));
        assert!(!is_safe_method("DELETE"));
        assert!(!is_safe_method("PATCH"));
    }

    #[test]
    fn test_is_allowlisted() {
        assert!(is_allowlisted("/api/auth/login"));
        assert!(is_allowlisted("/api/auth/logout"));
        assert!(is_allowlisted("/api/password-reset/request"));
        assert!(is_allowlisted("/api/password-reset/reset"));

        assert!(!is_allowlisted("/api/users"));
        assert!(!is_allowlisted("/api/posts"));
        assert!(!is_allowlisted("/"));
        assert!(!is_allowlisted("/api/admin"));
    }

    #[test]
    fn test_generate_token() {
        let token1 = generate_token();
        let token2 = generate_token();

        // Tokens should be different (random)
        assert_ne!(token1, token2);

        // Should be base64 URL-safe encoded (no padding)
        assert!(!token1.contains('='));
        assert!(!token1.contains('+'));
        assert!(!token1.contains('/'));

        // Should be 43 characters (32 bytes base64 encoded without padding)
        assert_eq!(token1.len(), 43);
        assert_eq!(token2.len(), 43);
    }

    #[test]
    fn test_build_cookie() {
        let token = "test_token_value";
        let cookie = build_cookie(token);

        assert!(cookie.contains("csrf_token=test_token_value"));
        assert!(cookie.contains("Path=/"));
        assert!(cookie.contains("SameSite=Strict"));

        // Should include Secure unless DIDHUB_DISABLE_SECURE is set
        std::env::remove_var("DIDHUB_DISABLE_SECURE");
        let cookie_secure = build_cookie(token);
        assert!(cookie_secure.contains("Secure"));

        // Set env var to disable secure
        std::env::set_var("DIDHUB_DISABLE_SECURE", "1");
        let cookie_no_secure = build_cookie(token);
        assert!(!cookie_no_secure.contains("Secure"));

        // Clean up
        std::env::remove_var("DIDHUB_DISABLE_SECURE");
    }
}

#[cfg(test)]
mod utils_tests {
    use super::*;
    use axum::http::{HeaderMap, HeaderValue, Method};

    #[test]
    fn test_is_safe_method() {
        assert!(didhub_middleware::utils::is_safe_method(&Method::GET));
        assert!(didhub_middleware::utils::is_safe_method(&Method::HEAD));
        assert!(didhub_middleware::utils::is_safe_method(&Method::OPTIONS));
        assert!(didhub_middleware::utils::is_safe_method(&Method::TRACE));

        assert!(!didhub_middleware::utils::is_safe_method(&Method::POST));
        assert!(!didhub_middleware::utils::is_safe_method(&Method::PUT));
        assert!(!didhub_middleware::utils::is_safe_method(&Method::DELETE));
        assert!(!didhub_middleware::utils::is_safe_method(&Method::PATCH));
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
    fn test_get_header_value() {
        let mut headers = HeaderMap::new();
        headers.insert("content-type", HeaderValue::from_static("application/json"));
        headers.insert("authorization", HeaderValue::from_static("Bearer token"));

        assert_eq!(
            get_header_value(&headers, "content-type"),
            Some("application/json")
        );
        assert_eq!(
            get_header_value(&headers, "authorization"),
            Some("Bearer token")
        );
        assert_eq!(get_header_value(&headers, "nonexistent"), None);
    }

    #[test]
    fn test_path_matches_pattern() {
        // Exact matches
        assert!(path_matches_pattern("/api/users", "/api/users"));
        assert!(path_matches_pattern("/api/users/123", "/api/users/123"));

        // Wildcard matches
        assert!(path_matches_pattern("/api/users/123", "/api/users/*"));
        assert!(path_matches_pattern("/api/posts/456", "/api/posts/*"));

        // No matches
        assert!(!path_matches_pattern("/api/users", "/api/users/*"));
        assert!(!path_matches_pattern("/api/posts", "/api/users"));
        assert!(!path_matches_pattern(
            "/api/users/123/profile",
            "/api/users/*"
        ));
    }

    #[test]
    fn test_path_matches_any() {
        let patterns = vec!["/api/users", "/api/posts/*"];
        assert!(path_matches_any("/api/users", &patterns));
        assert!(path_matches_any("/api/posts/123", &patterns));
        assert!(!path_matches_any("/api/comments", &patterns));
    }

    #[test]
    fn test_generate_cache_key() {
        assert_eq!(
            generate_cache_key(&Method::GET, "/api/users"),
            "GET:/api/users"
        );
        assert_eq!(
            generate_cache_key(&Method::POST, "/api/users"),
            "POST:/api/users"
        );
    }

    #[test]
    fn test_is_bot_user_agent() {
        // Known bots
        assert!(is_bot_user_agent(
            "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"
        ));
        assert!(is_bot_user_agent(
            "Mozilla/5.0 (compatible; Bingbot/2.0; +http://www.bing.com/bingbot.htm)"
        ));
        assert!(is_bot_user_agent("facebookexternalhit/1.1 facebot"));

        // Not bots
        assert!(!is_bot_user_agent(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        ));
        assert!(!is_bot_user_agent("curl/7.68.0"));
        assert!(!is_bot_user_agent("PostmanRuntime/7.26.8"));
    }
}
