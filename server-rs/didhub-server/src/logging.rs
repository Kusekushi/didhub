use tracing_subscriber::{fmt, layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

pub fn init(json: bool) {
    let env_filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"));
    // Build a base registry and then attach the appropriate fmt layer.
    let registry = tracing_subscriber::registry().with(env_filter);
    if json {
        let _ = registry.with(fmt::layer().json()).try_init();
    } else {
        let _ = registry.with(fmt::layer()).try_init();
    }
}
