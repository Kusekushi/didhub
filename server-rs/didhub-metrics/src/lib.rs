use once_cell::sync::Lazy;
use prometheus::{opts, Encoder, Histogram, HistogramOpts, IntCounter, IntCounterVec, IntGauge, TextEncoder};

pub static PROM_REGISTRY: Lazy<&prometheus::Registry> =
    Lazy::new(|| prometheus::default_registry());

// Rate limit counters (retained names for backward compatibility)
pub static RATE_LIMIT_DENIED: Lazy<IntCounterVec> = Lazy::new(|| {
    let c = IntCounterVec::new(
        opts!("didhub_rate_limit_denied_total", "Rate limit denials"),
        &["method", "route"],
    )
    .unwrap();
    PROM_REGISTRY.register(Box::new(c.clone())).ok();
    c
});
pub static RATE_LIMIT_ALLOWED: Lazy<IntCounterVec> = Lazy::new(|| {
    let c = IntCounterVec::new(
        opts!("didhub_rate_limit_allowed_total", "Rate limit allowed"),
        &["method", "route"],
    )
    .unwrap();
    PROM_REGISTRY.register(Box::new(c.clone())).ok();
    c
});

// OIDC counters
pub static OIDC_LOGIN_TOTAL: Lazy<IntCounterVec> = Lazy::new(|| {
    let c = IntCounterVec::new(
        opts!(
            "didhub_oidc_login_total",
            "OIDC login events by provider and result"
        ),
        &["provider", "result"],
    )
    .unwrap();
    PROM_REGISTRY.register(Box::new(c.clone())).ok();
    c
});
pub static OIDC_SECRET_UPDATE_TOTAL: Lazy<IntCounterVec> = Lazy::new(|| {
    let c = IntCounterVec::new(
        opts!(
            "didhub_oidc_secret_update_total",
            "OIDC client secret updates"
        ),
        &["provider"],
    )
    .unwrap();
    PROM_REGISTRY.register(Box::new(c.clone())).ok();
    c
});

// HTTP request metrics
pub static HTTP_REQUESTS_TOTAL: Lazy<IntCounterVec> = Lazy::new(|| {
    let c = IntCounterVec::new(
        opts!("didhub_http_requests_total", "Total HTTP requests"),
        &["method", "route", "status"],
    )
    .unwrap();
    PROM_REGISTRY.register(Box::new(c.clone())).ok();
    c
});

pub static HTTP_REQUEST_DURATION: Lazy<Histogram> = Lazy::new(|| {
    let h = Histogram::with_opts(HistogramOpts::new(
        "didhub_http_request_duration_seconds",
        "HTTP request duration in seconds",
    ))
    .unwrap();
    PROM_REGISTRY.register(Box::new(h.clone())).ok();
    h
});

// Database operation metrics
pub static DB_QUERIES_TOTAL: Lazy<IntCounterVec> = Lazy::new(|| {
    let c = IntCounterVec::new(
        opts!("didhub_db_queries_total", "Total database queries"),
        &["operation", "table", "result"],
    )
    .unwrap();
    PROM_REGISTRY.register(Box::new(c.clone())).ok();
    c
});

pub static DB_QUERY_DURATION: Lazy<Histogram> = Lazy::new(|| {
    let h = Histogram::with_opts(HistogramOpts::new(
        "didhub_db_query_duration_seconds",
        "Database query duration in seconds",
    ))
    .unwrap();
    PROM_REGISTRY.register(Box::new(h.clone())).ok();
    h
});

// Entity CRUD counters
pub static ENTITY_OPERATIONS_TOTAL: Lazy<IntCounterVec> = Lazy::new(|| {
    let c = IntCounterVec::new(
        opts!("didhub_entity_operations_total", "Entity CRUD operations"),
        &["entity", "operation", "result"],
    )
    .unwrap();
    PROM_REGISTRY.register(Box::new(c.clone())).ok();
    c
});

// Entity count gauges
pub static ENTITY_COUNT: Lazy<IntGauge> = Lazy::new(|| {
    let g = IntGauge::new("didhub_entity_count", "Current entity count").unwrap();
    PROM_REGISTRY.register(Box::new(g.clone())).ok();
    g
});

pub static USERS_TOTAL: Lazy<IntGauge> = Lazy::new(|| {
    let g = IntGauge::new("didhub_users_total", "Total registered users").unwrap();
    PROM_REGISTRY.register(Box::new(g.clone())).ok();
    g
});

pub static ALTERS_TOTAL: Lazy<IntGauge> = Lazy::new(|| {
    let g = IntGauge::new("didhub_alters_total", "Total alters").unwrap();
    PROM_REGISTRY.register(Box::new(g.clone())).ok();
    g
});

pub static SYSTEMS_TOTAL: Lazy<IntGauge> = Lazy::new(|| {
    let g = IntGauge::new("didhub_systems_total", "Total systems").unwrap();
    PROM_REGISTRY.register(Box::new(g.clone())).ok();
    g
});

pub static UPLOADS_TOTAL: Lazy<IntGauge> = Lazy::new(|| {
    let g = IntGauge::new("didhub_uploads_total", "Total uploads").unwrap();
    PROM_REGISTRY.register(Box::new(g.clone())).ok();
    g
});

pub static POSTS_TOTAL: Lazy<IntGauge> = Lazy::new(|| {
    let g = IntGauge::new("didhub_posts_total", "Total posts").unwrap();
    PROM_REGISTRY.register(Box::new(g.clone())).ok();
    g
});

// Upload metrics
pub static UPLOAD_BYTES_TOTAL: Lazy<IntCounter> = Lazy::new(|| {
    let c = IntCounter::new("didhub_upload_bytes_total", "Total uploaded bytes").unwrap();
    PROM_REGISTRY.register(Box::new(c.clone())).ok();
    c
});

pub static UPLOAD_OPERATIONS_TOTAL: Lazy<IntCounterVec> = Lazy::new(|| {
    let c = IntCounterVec::new(
        opts!("didhub_upload_operations_total", "Upload operations"),
        &["operation", "result"],
    )
    .unwrap();
    PROM_REGISTRY.register(Box::new(c.clone())).ok();
    c
});

// Authentication metrics
pub static AUTH_OPERATIONS_TOTAL: Lazy<IntCounterVec> = Lazy::new(|| {
    let c = IntCounterVec::new(
        opts!("didhub_auth_operations_total", "Authentication operations"),
        &["operation", "result"],
    )
    .unwrap();
    PROM_REGISTRY.register(Box::new(c.clone())).ok();
    c
});

// Error metrics
pub static ERRORS_TOTAL: Lazy<IntCounterVec> = Lazy::new(|| {
    let c = IntCounterVec::new(
        opts!("didhub_errors_total", "Application errors"),
        &["type", "operation"],
    )
    .unwrap();
    PROM_REGISTRY.register(Box::new(c.clone())).ok();
    c
});

// Cache metrics (if caching is implemented)
pub static CACHE_OPERATIONS_TOTAL: Lazy<IntCounterVec> = Lazy::new(|| {
    let c = IntCounterVec::new(
        opts!("didhub_cache_operations_total", "Cache operations"),
        &["operation", "result"],
    )
    .unwrap();
    PROM_REGISTRY.register(Box::new(c.clone())).ok();
    c
});

// Housekeeping metrics
pub static HOUSEKEEPING_RUNS_TOTAL: Lazy<IntCounterVec> = Lazy::new(|| {
    let c = IntCounterVec::new(
        opts!("didhub_housekeeping_runs_total", "Housekeeping job runs"),
        &["job", "result"],
    )
    .unwrap();
    PROM_REGISTRY.register(Box::new(c.clone())).ok();
    c
});

pub static HOUSEKEEPING_DURATION: Lazy<Histogram> = Lazy::new(|| {
    let h = Histogram::with_opts(HistogramOpts::new(
        "didhub_housekeeping_duration_seconds",
        "Housekeeping job duration in seconds",
    ))
    .unwrap();
    PROM_REGISTRY.register(Box::new(h.clone())).ok();
    h
});

// Metrics endpoint access counter
pub static METRICS_REQUESTS_TOTAL: Lazy<IntCounter> = Lazy::new(|| {
    let c = IntCounter::new(
        "didhub_metrics_requests_total",
        "Total metrics endpoint requests",
    )
    .unwrap();
    PROM_REGISTRY.register(Box::new(c.clone())).ok();
    c
});

pub async fn metrics_handler() -> (axum::http::StatusCode, String) {
    // Increment the metrics request counter
    METRICS_REQUESTS_TOTAL.inc();

    let encoder = TextEncoder::new();
    let metric_families = PROM_REGISTRY.gather();
    let mut buffer = Vec::new();
    encoder.encode(&metric_families, &mut buffer).ok();
    let result = String::from_utf8(buffer).unwrap_or_default();

    // If no metrics, return a simple test metric
    if result.is_empty() {
        return (
            axum::http::StatusCode::OK,
            "# HELP didhub_test_metric Test metric\n# TYPE didhub_test_metric counter\ndidhub_test_metric 1\n".to_string(),
        );
    }

    (axum::http::StatusCode::OK, result)
}

/// Update entity count gauges with provided values
/// This should be called periodically from the server with current database counts
pub fn update_entity_gauges(user_count: i64, alter_count: i64, system_count: i64, upload_count: i64, post_count: i64) {
    USERS_TOTAL.set(user_count);
    ALTERS_TOTAL.set(alter_count);
    SYSTEMS_TOTAL.set(system_count);
    UPLOADS_TOTAL.set(upload_count);
    POSTS_TOTAL.set(post_count);
}

/// Record HTTP request metrics
pub fn record_http_request(method: &str, route: &str, status: u16, duration: std::time::Duration) {
    HTTP_REQUESTS_TOTAL
        .with_label_values(&[method, route, &status.to_string()])
        .inc();
    HTTP_REQUEST_DURATION.observe(duration.as_secs_f64());
}

/// Record database operation metrics
pub fn record_db_operation(operation: &str, table: &str, result: &str, duration: std::time::Duration) {
    DB_QUERIES_TOTAL
        .with_label_values(&[operation, table, result])
        .inc();
    DB_QUERY_DURATION.observe(duration.as_secs_f64());
}

/// Record entity operation metrics
pub fn record_entity_operation(entity: &str, operation: &str, result: &str) {
    ENTITY_OPERATIONS_TOTAL
        .with_label_values(&[entity, operation, result])
        .inc();
}

/// Record upload operation metrics
pub fn record_upload_operation(operation: &str, result: &str, bytes: Option<i64>) {
    UPLOAD_OPERATIONS_TOTAL
        .with_label_values(&[operation, result])
        .inc();
    if let Some(bytes) = bytes {
        UPLOAD_BYTES_TOTAL.inc_by(bytes as u64);
    }
}

/// Record authentication operation metrics
pub fn record_auth_operation(operation: &str, result: &str) {
    AUTH_OPERATIONS_TOTAL
        .with_label_values(&[operation, result])
        .inc();
}

/// Record error metrics
pub fn record_error(error_type: &str, operation: &str) {
    ERRORS_TOTAL
        .with_label_values(&[error_type, operation])
        .inc();
}

/// Record cache operation metrics
pub fn record_cache_operation(operation: &str, result: &str) {
    CACHE_OPERATIONS_TOTAL
        .with_label_values(&[operation, result])
        .inc();
}

/// Record housekeeping job metrics
pub fn record_housekeeping_run(job: &str, result: &str, duration: std::time::Duration) {
    HOUSEKEEPING_RUNS_TOTAL
        .with_label_values(&[job, result])
        .inc();
    HOUSEKEEPING_DURATION.observe(duration.as_secs_f64());
}
