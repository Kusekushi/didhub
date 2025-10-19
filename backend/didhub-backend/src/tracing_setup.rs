use std::sync::Arc;
use tracing_subscriber::prelude::*;

/// Type alias for the reload handle returned by tracing initialization.
pub type ReloadHandle = Arc<dyn Fn(tracing_subscriber::EnvFilter) -> Result<(), String> + Send + Sync>;

/// Initialize tracing from configuration.
///
/// Returns a reload handle that can be used to update the log level at runtime.
pub fn install_tracing_from_config(cfg: &didhub_config::LoggingConfig) -> Option<ReloadHandle> {
    use tracing_subscriber::fmt::time::ChronoUtc;

    let env_filter_str = std::env::var("RUST_LOG").unwrap_or_else(|_| cfg.level.clone());

    // Each branch creates its own reload layer since the subscriber types differ.
    // We return a type-erased wrapper for runtime reloading.
    if cfg.json {
        let env_filter = tracing_subscriber::EnvFilter::new(&env_filter_str);
        let (reload_layer, reload_handle) =
            tracing_subscriber::reload::Layer::new(env_filter.clone());

        tracing_subscriber::fmt()
            .json()
            .with_env_filter(env_filter)
            .with_max_level(tracing::Level::TRACE)
            .with_timer(ChronoUtc::rfc_3339())
            .finish()
            .with(reload_layer)
            .init();

        Some(Arc::new(move |filter| {
            reload_handle
                .reload(filter)
                .map_err(|e| format!("reload failed: {e}"))
        }))
    } else {
        let env_filter = tracing_subscriber::EnvFilter::new(&env_filter_str);
        let (reload_layer, reload_handle) =
            tracing_subscriber::reload::Layer::new(env_filter.clone());

        tracing_subscriber::fmt()
            .with_env_filter(env_filter)
            .with_max_level(tracing::Level::TRACE)
            .finish()
            .with(reload_layer)
            .init();

        Some(Arc::new(move |filter| {
            reload_handle
                .reload(filter)
                .map_err(|e| format!("reload failed: {e}"))
        }))
    }
}
