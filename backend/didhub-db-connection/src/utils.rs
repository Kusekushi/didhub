use std::borrow::Cow;

use serde_json::json;

use crate::config::DbConnectionConfig;

pub fn config_metadata(config: &DbConnectionConfig) -> serde_json::Value {
    json!({
        "database_url": sanitize_database_url(&config.url).as_ref(),
        "max_connections": config.max_connections,
        "min_connections": config.min_connections,
        "connect_timeout_secs": config.connect_timeout_secs,
        "idle_timeout_secs": config.idle_timeout_secs,
        "test_before_acquire": config.test_before_acquire,
    })
}

pub fn sanitize_database_url(raw: &str) -> Cow<'_, str> {
    // Simple regex-free sanitization: find "://user:pass@" or "://user@" patterns
    // and redact the credentials portion.
    let Some(scheme_end) = raw.find("://") else {
        return Cow::Borrowed("<redacted>");
    };
    let rest = &raw[scheme_end + 3..];

    // Find the host portion (ends at / or end of string)
    let host_end = rest.find('/').unwrap_or(rest.len());
    let authority = &rest[..host_end];

    // Check for @ which indicates credentials
    if let Some(at_pos) = authority.rfind('@') {
        // There are credentials to redact - only allocate when needed
        let scheme = &raw[..scheme_end + 3];
        let host_and_rest = &rest[at_pos + 1..];
        let mut result = String::with_capacity(scheme.len() + 10 + host_and_rest.len());
        result.push_str(scheme);
        result.push_str("****:****@");
        result.push_str(host_and_rest);
        Cow::Owned(result)
    } else {
        // No credentials, return as-is without allocation
        Cow::Borrowed(raw)
    }
}
