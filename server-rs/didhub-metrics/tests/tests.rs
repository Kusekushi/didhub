use didhub_metrics::{
    OIDC_LOGIN_TOTAL, OIDC_SECRET_UPDATE_TOTAL, RATE_LIMIT_ALLOWED, RATE_LIMIT_DENIED,
    HTTP_REQUESTS_TOTAL, DB_QUERIES_TOTAL, ENTITY_OPERATIONS_TOTAL,
    USERS_TOTAL, ALTERS_TOTAL, SYSTEMS_TOTAL, UPLOADS_TOTAL, POSTS_TOTAL,
    UPLOAD_OPERATIONS_TOTAL, ERRORS_TOTAL, METRICS_REQUESTS_TOTAL,
    AUTH_OPERATIONS_TOTAL, CACHE_OPERATIONS_TOTAL,
    update_entity_gauges, record_http_request, record_db_operation, record_entity_operation,
    record_upload_operation, record_auth_operation, record_error, record_cache_operation,
    metrics_handler,
};

#[test]
fn test_rate_limit_counters_initialization() {
    // Test that counters can be accessed (lazy initialization)
    let _denied = &*RATE_LIMIT_DENIED;
    let _allowed = &*RATE_LIMIT_ALLOWED;
    // If we get here without panicking, initialization worked
}

#[test]
fn test_oidc_counters_initialization() {
    // Test that OIDC counters can be accessed (lazy initialization)
    let _login = &*OIDC_LOGIN_TOTAL;
    let _secret = &*OIDC_SECRET_UPDATE_TOTAL;
    // If we get here without panicking, initialization worked
}

#[test]
fn test_new_metrics_initialization() {
    // Test that new metrics can be accessed
    let _http = &*HTTP_REQUESTS_TOTAL;
    let _db = &*DB_QUERIES_TOTAL;
    let _entity = &*ENTITY_OPERATIONS_TOTAL;
    let _users = &*USERS_TOTAL;
    let _alters = &*ALTERS_TOTAL;
    let _systems = &*SYSTEMS_TOTAL;
    let _uploads = &*UPLOADS_TOTAL;
    let _posts = &*POSTS_TOTAL;
    let _upload_ops = &*UPLOAD_OPERATIONS_TOTAL;
    let _errors = &*ERRORS_TOTAL;
    let _metrics = &*METRICS_REQUESTS_TOTAL;
    // If we get here without panicking, initialization worked
}

#[test]
fn test_rate_limit_denied_counter_increment() {
    let counter = &*RATE_LIMIT_DENIED;
    let initial = counter.with_label_values(&["GET", "/test"]).get();

    counter.with_label_values(&["GET", "/test"]).inc();

    let after = counter.with_label_values(&["GET", "/test"]).get();
    assert_eq!(after, initial + 1);
}

#[test]
fn test_rate_limit_allowed_counter_increment() {
    let counter = &*RATE_LIMIT_ALLOWED;
    let initial = counter.with_label_values(&["POST", "/api"]).get();

    counter.with_label_values(&["POST", "/api"]).inc();

    let after = counter.with_label_values(&["POST", "/api"]).get();
    assert_eq!(after, initial + 1);
}

#[test]
fn test_oidc_login_counter_increment() {
    let counter = &*OIDC_LOGIN_TOTAL;
    let initial = counter.with_label_values(&["google", "success"]).get();

    counter.with_label_values(&["google", "success"]).inc();

    let after = counter.with_label_values(&["google", "success"]).get();
    assert_eq!(after, initial + 1);
}

#[test]
fn test_oidc_secret_update_counter_increment() {
    let counter = &*OIDC_SECRET_UPDATE_TOTAL;
    let initial = counter.with_label_values(&["github"]).get();

    counter.with_label_values(&["github"]).inc();

    let after = counter.with_label_values(&["github"]).get();
    assert_eq!(after, initial + 1);
}

#[test]
fn test_http_requests_counter_increment() {
    let counter = &*HTTP_REQUESTS_TOTAL;
    let initial = counter.with_label_values(&["GET", "/api/users", "200"]).get();

    counter.with_label_values(&["GET", "/api/users", "200"]).inc();

    let after = counter.with_label_values(&["GET", "/api/users", "200"]).get();
    assert_eq!(after, initial + 1);
}

#[test]
fn test_entity_operations_counter_increment() {
    let counter = &*ENTITY_OPERATIONS_TOTAL;
    let initial = counter.with_label_values(&["user", "create", "success"]).get();

    counter.with_label_values(&["user", "create", "success"]).inc();

    let after = counter.with_label_values(&["user", "create", "success"]).get();
    assert_eq!(after, initial + 1);
}

#[test]
fn test_update_entity_gauges() {
    update_entity_gauges(10, 25, 5, 100, 50);

    assert_eq!(USERS_TOTAL.get(), 10);
    assert_eq!(ALTERS_TOTAL.get(), 25);
    assert_eq!(SYSTEMS_TOTAL.get(), 5);
    assert_eq!(UPLOADS_TOTAL.get(), 100);
    assert_eq!(POSTS_TOTAL.get(), 50);
}

#[test]
fn test_record_http_request() {
    let counter = &*HTTP_REQUESTS_TOTAL;
    let initial = counter.with_label_values(&["POST", "/api/test", "201"]).get();

    record_http_request("POST", "/api/test", 201, std::time::Duration::from_millis(150));

    let after = counter.with_label_values(&["POST", "/api/test", "201"]).get();
    assert_eq!(after, initial + 1);
}

#[test]
fn test_record_db_operation() {
    let counter = &*DB_QUERIES_TOTAL;
    let initial = counter.with_label_values(&["select", "users", "success"]).get();

    record_db_operation("select", "users", "success", std::time::Duration::from_millis(50));

    let after = counter.with_label_values(&["select", "users", "success"]).get();
    assert_eq!(after, initial + 1);
}

#[test]
fn test_record_entity_operation() {
    let counter = &*ENTITY_OPERATIONS_TOTAL;
    let initial = counter.with_label_values(&["alter", "update", "success"]).get();

    record_entity_operation("alter", "update", "success");

    let after = counter.with_label_values(&["alter", "update", "success"]).get();
    assert_eq!(after, initial + 1);
}

#[test]
fn test_record_upload_operation() {
    let counter = &*UPLOAD_OPERATIONS_TOTAL;
    let initial = counter.with_label_values(&["upload", "success"]).get();

    record_upload_operation("upload", "success", Some(1024));

    let after = counter.with_label_values(&["upload", "success"]).get();
    assert_eq!(after, initial + 1);
}

#[test]
fn test_record_auth_operation() {
    let counter = &*AUTH_OPERATIONS_TOTAL;
    let initial = counter.with_label_values(&["login", "success"]).get();

    record_auth_operation("login", "success");

    let after = counter.with_label_values(&["login", "success"]).get();
    assert_eq!(after, initial + 1);
}

#[test]
fn test_record_error() {
    let counter = &*ERRORS_TOTAL;
    let initial = counter.with_label_values(&["validation", "user_create"]).get();

    record_error("validation", "user_create");

    let after = counter.with_label_values(&["validation", "user_create"]).get();
    assert_eq!(after, initial + 1);
}

#[test]
fn test_record_cache_operation() {
    let counter = &*CACHE_OPERATIONS_TOTAL;
    let initial = counter.with_label_values(&["get", "hit"]).get();

    record_cache_operation("get", "hit");

    let after = counter.with_label_values(&["get", "hit"]).get();
    assert_eq!(after, initial + 1);
}

#[tokio::test]
async fn test_metrics_handler() {
    let result = metrics_handler().await;
    assert_eq!(result.0, axum::http::StatusCode::OK);
    assert!(result.1.contains("# HELP"));
    assert!(result.1.contains("# TYPE"));
}
