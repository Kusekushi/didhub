//! DIDHub Backend Server
//!
//! Entry point for the didhub-backend server with configuration loading,
//! database migrations, and HTTP server startup.

use std::sync::Arc;

use axum::{http::StatusCode, Router};
use didhub_job_queue::JobQueueClient;
use didhub_updates::UpdateCoordinator;
use tokio::net::TcpListener;

use didhub_backend::rate_limiter::RateLimiterManager;
use didhub_backend::state::AppState;

mod auth_builder;
mod bootstrap;
mod cli;
mod config_helpers;
mod config_reloader;
mod tracing_setup;

use auth_builder::build_authenticator_from_config;
use bootstrap::maybe_provision_admin;
use cli::CliArgs;
use config_helpers::{
    database_config_from_config, log_client_from_config, parse_bind_address,
    service_unavailable_handler,
};
use tracing_setup::install_tracing_from_config;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    eprintln!("[STARTUP] DIDHub Backend starting...");
    let args = CliArgs::parse();

    if args.help_requested {
        CliArgs::print_help();
        return Ok(());
    }

    // Resolve config path: CLI > environment variable
    let config_path = args
        .config_path
        .or_else(|| std::env::var("DIDHUB_CONFIG_PATH").ok());

    eprintln!("[STARTUP] Loading config from: {:?}", config_path);
    let config = load_config(&config_path)?;
    eprintln!("[STARTUP] Config loaded successfully");

    // Propagate config path to environment for downstream code
    if let Some(ref p) = config_path {
        // SAFETY: We're in main() before spawning threads, setting a single env var.
        unsafe { std::env::set_var("DIDHUB_CONFIG_PATH", p) };
    }

    // Initialize tracing
    eprintln!("[STARTUP] Initializing tracing...");
    let reload_handle = install_tracing_from_config(&config.logging);
    let log_client = log_client_from_config(&config);
    eprintln!("[STARTUP] Tracing initialized");

    // Initialize services
    eprintln!("[STARTUP] Initializing services...");
    let job_queue = JobQueueClient::new();
    let updates = UpdateCoordinator::new();

    // Create and migrate database
    eprintln!("[STARTUP] Setting up database...");
    let db_cfg = database_config_from_config(&config);
    let db_pool = didhub_db::create_pool(&db_cfg).await.expect("create pool");
    eprintln!("[STARTUP] Database pool created");
    run_migrations(&db_cfg, &db_pool).await?;
    eprintln!("[STARTUP] Database migrations completed");

    tracing::info!(
        db_url = %db_cfg.url,
        db_max_connections = %db_cfg.max_connections,
        uploads_dir = %config.uploads.directory,
        "database and uploads configuration"
    );

    // Build rate limiter
    eprintln!("[STARTUP] Building rate limiter...");
    let limiter = RateLimiterManager::from_config(
        config.rate_limit.enabled,
        config.rate_limit.per_ip,
        config.rate_limit.per_user,
        config.rate_limit.rate_per_sec,
        config.rate_limit.burst,
        config.rate_limit.exempt_paths.clone(),
    );
    let shared_config = Arc::new(tokio::sync::RwLock::new(config.clone()));
    let shared_limiter = Arc::new(tokio::sync::RwLock::new(limiter));
    eprintln!("[STARTUP] Rate limiter configured");

    // Build authenticator and app state
    eprintln!("[STARTUP] Building authenticator and app state...");
    let (startup_app_state, maintenance_msg) = match build_authenticator_from_config(&config) {
        Ok((authenticator, info)) => {
            tracing::info!(
                auth_mode = %info.mode,
                key_fingerprint = info.fingerprint.as_deref().unwrap_or("-"),
                key_type = info.key_type.as_deref().unwrap_or("-"),
                key_bits = info.bits.map(|b| b.to_string()).as_deref().unwrap_or("-"),
                "authentication configured"
            );
            eprintln!("[STARTUP] Authenticator built successfully");
            let state = AppState::new(
                db_pool,
                log_client,
                authenticator,
                job_queue.clone(),
                updates,
            );
            eprintln!("[STARTUP] AppState created");
            (Some(Arc::new(state)), None)
        }
        Err(reason) => {
            eprintln!("[STARTUP] ERROR: Authentication failed: {}", reason);
            tracing::error!(%reason, "entering maintenance mode due to authentication configuration");
            (None, Some(reason))
        }
    };

    // Spawn background config reloader
    eprintln!("[STARTUP] Setting up config reloader...");
    if config.auto_update.check_enabled {
        config_reloader::spawn_config_reloader(
            config_path.clone(),
            config.auto_update.check_interval_hours,
            shared_config.clone(),
            reload_handle,
            startup_app_state.clone(),
            shared_limiter.clone(),
            job_queue.clone(),
        );
        eprintln!("[STARTUP] Config reloader spawned");
    }

    // Provision admin if configured
    eprintln!("[STARTUP] Checking admin provisioning...");
    if let Some(ref state) = startup_app_state {
        if let Err(e) = maybe_provision_admin(state).await {
            tracing::error!(%e, "failed to provision admin from environment");
            eprintln!("[STARTUP] Admin provisioning error: {}", e);
        }
    }

    // Build router
    eprintln!("[STARTUP] Building application router...");
    let app = build_app(startup_app_state, maintenance_msg, &shared_limiter).await;
    eprintln!("[STARTUP] Router built successfully");

    // Start server
    eprintln!(
        "[STARTUP] Binding to {}:{}",
        config.server.host, config.server.port
    );
    let addr = parse_bind_address(&config.server.host, config.server.port);
    eprintln!("[STARTUP] Parsed address: {:?}", addr);

    let listener = TcpListener::bind(addr).await?;
    eprintln!(
        "[STARTUP] ✓ Server listening on {}:{}",
        config.server.host, config.server.port
    );
    eprintln!("[STARTUP] ✓ Frontend embedded: YES");
    eprintln!("[STARTUP] ✓ Ready to accept connections!");

    axum::serve(listener, app.into_make_service()).await?;

    Ok(())
}

/// Load configuration from file or defaults.
fn load_config(path: &Option<String>) -> anyhow::Result<didhub_config::Config> {
    match path.as_deref() {
        Some(p) => didhub_config::load_config(Some(p)).map_err(|e| {
            eprintln!("failed to load configuration: {e}");
            anyhow::anyhow!(e.to_string())
        }),
        None => didhub_config::load_config::<&std::path::Path>(None).map_err(|e| {
            eprintln!("failed to load configuration: {e}");
            anyhow::anyhow!(e.to_string())
        }),
    }
}

/// Run database migrations based on the database type.
async fn run_migrations(
    db_cfg: &didhub_db::DbConnectionConfig,
    db_pool: &didhub_db::DbPool,
) -> anyhow::Result<()> {
    let url_lower = db_cfg.url.to_lowercase();

    let migrate_res = if url_lower.starts_with("postgres")
        || url_lower.contains("postgresql")
        || url_lower.contains("postgres://")
    {
        tracing::info!(db_url = %db_cfg.url, "applying Postgres migrations");
        didhub_migrations::postgres_migrator().run(db_pool).await
    } else if url_lower.starts_with("mysql") || url_lower.contains("mysql://") {
        tracing::info!(db_url = %db_cfg.url, "applying MySQL migrations");
        didhub_migrations::mysql_migrator().run(db_pool).await
    } else {
        tracing::info!(db_url = %db_cfg.url, "applying SQLite migrations");
        didhub_migrations::sqlite_migrator().run(db_pool).await
    };

    match migrate_res {
        Ok(_) => {
            tracing::info!("database migrations applied successfully");
            Ok(())
        }
        Err(e) => {
            tracing::error!(%e, "failed to apply database migrations");
            Err(anyhow::anyhow!("failed to apply database migrations: {e}"))
        }
    }
}

/// Build the application router, either normal or maintenance mode.
async fn build_app(
    state: Option<Arc<AppState>>,
    maintenance_msg: Option<String>,
    shared_limiter: &tokio::sync::RwLock<RateLimiterManager>,
) -> Router {
    if let Some(state_arc) = state {
        let limiter = shared_limiter.read().await.clone();
        didhub_backend::build_router_with_limiter(state_arc, limiter)
    } else {
        let msg = maintenance_msg.unwrap_or_else(|| "maintenance".to_string());
        tracing::info!(%msg, "starting maintenance router");
        Router::new()
            .route(
                "/health",
                axum::routing::get(|| async { (StatusCode::OK, "OK") }),
            )
            .route(
                "/ready",
                axum::routing::get(|| async { (StatusCode::SERVICE_UNAVAILABLE, "maintenance") }),
            )
            .fallback(service_unavailable_handler)
    }
}
