//! # DIDHub Server Main Binary
//!
//! This is the main entry point for the DIDHub Rust server. It handles:
//! - Command-line argument parsing
//! - Configuration loading from environment and files
//! - Database connection establishment
//! - Server startup and graceful shutdown
//! - Optional background update checking
//!
//! ## Command Line Usage
//!
//! ```bash
//! didhub-server --config path/to/config.json
//! ```
//!
//! ## Environment Variables
//!
//! See the root README.md for a complete list of supported environment variables.

use clap::Parser;
use didhub_config as config;
use didhub_db as db;
use didhub_server::{self as server, logging, services};
use tracing::info;

#[derive(Parser)]
#[command(name = "didhub-server")]
#[command(about = "DIDHub Rust server")]
struct Args {
    /// Path to configuration file
    #[arg(short, long)]
    config: Option<String>,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let args = Args::parse();

    // Handle config file argument
    if let Some(config_path) = args.config {
        // Only set if not already supplied via env to preserve explicit env precedence
        if std::env::var("DIDHUB_DB_CONFIG").is_err()
            && std::env::var("DIDHUB_CONFIG_FILE").is_err()
        {
            std::env::set_var("DIDHUB_DB_CONFIG", config_path);
        }
    }

    let _ = dotenvy::dotenv();
    // Ensure sqlx any drivers (sqlite, postgres, mysql) are registered before pool creation
    // This is required when using sqlx::AnyPool to avoid "No drivers installed" panic.
    sqlx::any::install_default_drivers();

    let cfg = config::AppConfig::from_env()?;
    logging::init(cfg.log_json);
    // Emit resolved logging configuration so operators can confirm active settings.
    let resolved_rust_log = std::env::var("RUST_LOG").unwrap_or_else(|_| "<not-set>".into());
    tracing::info!(rust_log=%resolved_rust_log, log_json=%cfg.log_json, "resolved logging configuration");

    // Install a panic hook that logs backtraces for easier diagnosis of unexpected panics
    std::panic::set_hook(Box::new(|info| {
        let bt = std::backtrace::Backtrace::force_capture();
        tracing::error!(error=%info, backtrace=%bt, "panic captured");
    }));

    let database = db::Db::connect().await?;
    if let Err(e) = database.ensure_bootstrap_admin(&cfg).await {
        tracing::error!(error=%e, "failed bootstrapping admin user");
    }

    // Start background update checker if enabled
    #[cfg(feature = "updater")]
    {
        if cfg.auto_update_check {
            tracing::info!("Starting background update checker");
            let db_clone = database.clone();
            let cfg_clone = cfg.clone();
            tokio::spawn(async move {
                background_update_checker(db_clone, cfg_clone).await;
            });
        } else {
            tracing::debug!("Background update checker disabled (AUTO_UPDATE_CHECK=false)");
        }
    }

    let app_components = server::build_app(database.clone(), cfg.clone()).await;

    let listener = tokio::net::TcpListener::bind((cfg.host.as_str(), cfg.port)).await?;
    let db_source = if std::env::var("DIDHUB_DB").ok() == cfg.db_url {
        "file"
    } else {
        "env"
    };
    info!(port = cfg.port, host = %cfg.host, origins=?cfg.frontend_origins, db_url=?cfg.db_url, db_source=%db_source, "DIDHub Rust server listening");
    axum::serve(listener, app_components.router.into_make_service())
        .with_graceful_shutdown(shutdown_signal_with_cleanup(app_components.services))
        .await?;
    Ok(())
}

async fn shutdown_signal() {
    use tokio::signal;
    let ctrl_c = async {
        signal::ctrl_c()
            .await
            .expect("failed to install Ctrl+C handler");
    };
    #[cfg(unix)]
    let terminate = async {
        signal::unix::signal(signal::unix::SignalKind::terminate())
            .expect("failed to install signal handler")
            .recv()
            .await;
    };
    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }
    tracing::info!("shutdown signal received");
}

async fn shutdown_signal_with_cleanup(services: services::ServiceComponents) {
    shutdown_signal().await;
    
    // Perform cleanup of services
    tracing::info!("shutting down services");
    if let Err(e) = services.registry.stop().await {
        tracing::error!(error = %e, "failed to stop cron scheduler");
    }
    tracing::info!("services shutdown complete");
}

#[cfg(feature = "updater")]
async fn background_update_checker(db: db::Db, cfg: config::AppConfig) {
    use didhub_updater::{check_for_updates, UpdateConfig};

    let config = UpdateConfig::default();
    let check_interval = std::time::Duration::from_secs(cfg.update_check_interval_hours * 3600);

    tracing::info!(
        interval_hours = cfg.update_check_interval_hours,
        repo = format!("{}/{}", config.repo_owner, config.repo_name),
        "Background update checker started"
    );

    let mut interval = tokio::time::interval(check_interval);
    interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);

    loop {
        interval.tick().await;

        tracing::debug!("Running scheduled update check");

        match check_for_updates(&config).await {
            Ok(status) => {
                if status.available {
                    tracing::info!(
                        current = status.current_version,
                        latest = status.latest_version,
                        "Update available: {}",
                        status.message
                    );

                    // Log to audit trail (system user)
                    db::audit::record_with_metadata(
                        &db,
                        None, // System-initiated check
                        "system.update.available",
                        Some("update"),
                        status.latest_version.as_deref(),
                        serde_json::json!({
                            "current": status.current_version,
                            "latest": status.latest_version,
                            "message": status.message,
                            "scheduled_check": true
                        }),
                    )
                    .await;
                } else {
                    tracing::debug!("No updates available: {}", status.message);
                }
            }
            Err(e) => {
                tracing::warn!(error = %e, "Scheduled update check failed");

                // Log failure to audit trail
                db::audit::record_with_metadata(
                    &db,
                    None, // System-initiated check
                    "system.update.check_failed",
                    Some("update"),
                    None,
                    serde_json::json!({
                        "error": e.to_string(),
                        "scheduled_check": true
                    }),
                )
                .await;
            }
        }
    }
}
