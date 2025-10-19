use std::sync::Arc;

use didhub_backend::rate_limiter::RateLimiterManager;
use didhub_backend::state::AppState;
use didhub_job_queue::JobQueueClient;
use tokio::sync::RwLock;

use crate::auth_builder::build_authenticator_from_config;
use crate::config_helpers::log_client_from_config;
use crate::tracing_setup::ReloadHandle;

/// Spawn the background configuration reloader task.
///
/// This task periodically checks for configuration changes and hot-reloads:
/// - Log level
/// - Log client
/// - Authenticator
/// - Rate limiter
pub fn spawn_config_reloader(
    config_path: Option<String>,
    interval_hours: u64,
    shared_config: Arc<RwLock<didhub_config::Config>>,
    reload_handle: Option<ReloadHandle>,
    app_state: Option<Arc<AppState>>,
    shared_limiter: Arc<RwLock<RateLimiterManager>>,
    job_queue: JobQueueClient,
) {
    tokio::spawn(async move {
        let mut interval =
            tokio::time::interval(std::time::Duration::from_secs(interval_hours * 3600));

        loop {
            interval.tick().await;

            match didhub_config::load_config(config_path.as_deref()) {
                Ok(new_cfg) => {
                    if let Err(e) = didhub_config::validate_config(&new_cfg) {
                        tracing::error!(%e, "loaded config failed validation, ignoring");
                        continue;
                    }

                    let mut guard = shared_config.write().await;
                    if *guard != new_cfg {
                        let old = guard.clone();
                        *guard = new_cfg.clone();
                        drop(guard); // Release lock before potentially slow operations

                        tracing::info!("configuration changed, enqueuing reload job");

                        // Hot-reload log level
                        reload_log_level(&old, &new_cfg, &reload_handle);

                        // Hot-reload state components
                        if let Some(ref state) = app_state {
                            reload_log_client(&old, &new_cfg, state);
                            reload_authenticator(&new_cfg, state);
                        }

                        // Hot-reload rate limiter
                        reload_rate_limiter(&new_cfg, &shared_limiter).await;

                        // Enqueue job for any other reload processing
                        let payload = serde_json::json!({"old": old, "new": new_cfg});
                        let _ = job_queue
                            .enqueue(didhub_job_queue::JobRequest::new("config.reload", payload))
                            .await;
                    }
                }
                Err(e) => tracing::error!(%e, "failed to reload config file"),
            }
        }
    });
}

fn reload_log_level(
    old: &didhub_config::Config,
    new: &didhub_config::Config,
    reload_handle: &Option<ReloadHandle>,
) {
    if old.logging.level != new.logging.level {
        if let Some(handler) = reload_handle.as_ref() {
            let filter = tracing_subscriber::EnvFilter::new(new.logging.level.clone());
            match handler(filter) {
                Ok(()) => {
                    tracing::info!(new_level = %new.logging.level, "log level updated at runtime")
                }
                Err(e) => tracing::error!(%e, "failed to reload log level"),
            }
        }
    }
}

fn reload_log_client(old: &didhub_config::Config, new: &didhub_config::Config, state: &AppState) {
    if old.logging.log_dir != new.logging.log_dir {
        let new_log_client = log_client_from_config(new);
        let _old_client = state.swap_log_client(new_log_client);
        tracing::info!("swapped log client at runtime");
    }
}

fn reload_authenticator(new: &didhub_config::Config, state: &AppState) {
    match build_authenticator_from_config(new) {
        Ok((new_auth, _info)) => {
            let _old_auth = state.swap_authenticator(new_auth);
            tracing::info!("swapped authenticator at runtime");
        }
        Err(e) => {
            tracing::error!(%e, "new authenticator failed to build; leaving existing authenticator in place");
        }
    }
}

async fn reload_rate_limiter(new: &didhub_config::Config, shared_limiter: &RwLock<RateLimiterManager>) {
    let new_limiter = RateLimiterManager::from_config(
        new.rate_limit.enabled,
        new.rate_limit.per_ip,
        new.rate_limit.per_user,
        new.rate_limit.rate_per_sec,
        new.rate_limit.burst,
        new.rate_limit.exempt_paths.clone(),
    );
    let mut guard = shared_limiter.write().await;
    *guard = new_limiter;
    tracing::info!("rate limiter configuration reloaded");
}
