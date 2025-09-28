use didhub_metrics::{
    OIDC_LOGIN_TOTAL, OIDC_SECRET_UPDATE_TOTAL, RATE_LIMIT_ALLOWED, RATE_LIMIT_DENIED,
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
