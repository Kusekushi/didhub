use std::path::Path;

/// Normalize a path relative to a base directory
pub fn normalize_path(p: &str, base: &Path) -> String {
    use std::path::PathBuf;
    let mut pb = PathBuf::from(p);
    if pb.is_relative() {
        pb = base.join(pb);
    }
    pb.to_string_lossy().replace('\\', "/")
}

/// Parse a list of origins from a string (comma-separated or JSON array)
pub fn parse_origin_list(raw: &str) -> Vec<String> {
    // Accept JSON array or comma-separated list
    let trimmed = raw.trim();
    if trimmed.starts_with('[') {
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(trimmed) {
            if let Some(arr) = v.as_array() {
                return arr
                    .iter()
                    .filter_map(|x| x.as_str())
                    .map(|s| normalize_origin(s))
                    .collect();
            }
        }
    }
    trimmed
        .split(',')
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .map(normalize_origin)
        .collect()
}

/// Normalize an origin URL
pub fn normalize_origin(s: &str) -> String {
    if let Ok(u) = url::Url::parse(s) {
        u.origin().ascii_serialization()
    } else {
        s.trim_end_matches('/').to_string()
    }
}