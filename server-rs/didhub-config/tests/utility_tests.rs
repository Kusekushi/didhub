#[test]
fn normalize_path_with_absolute_path() {
    use didhub_config::normalize_path;
    use std::path::Path;

    let base = Path::new("/base");
    let result = normalize_path("/absolute/path", base);
    assert_eq!(result, "/absolute/path");
}

#[test]
fn normalize_path_with_relative_path() {
    use didhub_config::normalize_path;
    use std::path::Path;

    let base = Path::new("/base");
    let result = normalize_path("relative/path", base);
    assert_eq!(result, "/base/relative/path");
}

#[test]
fn normalize_path_normalizes_slashes() {
    use didhub_config::normalize_path;
    use std::path::Path;

    let base = Path::new("C:\\base");
    let result = normalize_path("path\\with\\backslashes", base);
    assert_eq!(result, "C:/base/path/with/backslashes");
}

#[test]
fn normalize_origin_with_valid_url() {
    use didhub_config::normalize_origin;

    let result = normalize_origin("https://example.com/path");
    assert_eq!(result, "https://example.com");
}

#[test]
fn normalize_origin_with_invalid_url() {
    use didhub_config::normalize_origin;

    let result = normalize_origin("not-a-url");
    assert_eq!(result, "not-a-url");
}

#[test]
fn normalize_origin_trims_trailing_slash() {
    use didhub_config::normalize_origin;

    let result = normalize_origin("https://example.com/");
    assert_eq!(result, "https://example.com");
}