use once_cell::sync::Lazy;
use prometheus::{opts, Encoder, IntCounter, IntCounterVec, TextEncoder};

pub static PROM_REGISTRY: Lazy<&prometheus::Registry> = Lazy::new(|| prometheus::default_registry());

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

// Metrics endpoint access counter
pub static METRICS_REQUESTS_TOTAL: Lazy<IntCounter> = Lazy::new(|| {
    let c = IntCounter::new("didhub_metrics_requests_total", "Total metrics endpoint requests")
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
    
    (
        axum::http::StatusCode::OK,
        result,
    )
}
