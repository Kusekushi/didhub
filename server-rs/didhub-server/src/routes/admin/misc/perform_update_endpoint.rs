use axum::{
    extract::{Extension, Query},
    Json,
};
use didhub_config::AppConfig;
#[cfg(feature = "updater")]
use didhub_db::settings::SettingOperations;
use didhub_db::{audit, Db};
use didhub_error::AppError;
use didhub_middleware::types::CurrentUser;
use tracing::warn;
#[cfg(feature = "updater")]
use tracing::{error, info};

use super::UpdateCheckQuery;

#[cfg(feature = "updater")]
use didhub_updater::{check_for_updates, perform_update, UpdateConfig, UpdateResult};

#[cfg(not(feature = "updater"))]
use super::UpdateResult;

#[cfg(feature = "updater")]
pub async fn perform_update_endpoint(
    Extension(user): Extension<CurrentUser>,
    Extension(db): Extension<Db>,
    Extension(cfg): Extension<AppConfig>,
    Query(query): Query<UpdateCheckQuery>,
) -> Result<Json<UpdateResult>, AppError> {
    if user.is_admin == 0 {
        return Err(AppError::Forbidden);
    }

    let auto_update_enabled = match db.get_setting("auto_update_enabled").await {
        Ok(Some(setting)) => match serde_json::from_str::<String>(&setting.value) {
            Ok(s) => matches!(s.as_str(), "1" | "true" | "yes"),
            _ => cfg.auto_update_enabled,
        },
        _ => cfg.auto_update_enabled,
    };

    if !auto_update_enabled {
        warn!(user_id=%user.id, "update perform attempted but auto-updates are disabled");
            let ip_arc = didhub_middleware::client_ip::get_request_ip();
            let ip = ip_arc.as_ref().map(|s| s.as_str());
            audit::record_with_metadata(
                &db,
                Some(user.id.as_str()),
                "admin.update.disabled",
                Some("update"),
                None,
                serde_json::json!({"enabled": auto_update_enabled}),
                ip,
            )
            .await;

        return Ok(Json(UpdateResult {
            success: false,
            message: "Auto-updates are disabled. Set AUTO_UPDATE_ENABLED=true to enable."
                .to_string(),
            version_updated: None,
            restart_needed: false,
        }));
    }

    if query.check_only {
        let config = UpdateConfig::default();
        match check_for_updates(&config).await {
            Ok(status) => {
                return Ok(Json(UpdateResult {
                    success: status.available,
                    message: status.message,
                    version_updated: status.latest_version,
                    restart_needed: false,
                }));
            }
            Err(e) => {
                return Ok(Json(UpdateResult {
                    success: false,
                    message: format!("Failed to check for updates: {}", e),
                    version_updated: None,
                    restart_needed: false,
                }));
            }
        }
    }

    let config = UpdateConfig::default();

    match perform_update(&config).await {
        Ok(result) => {
            if result.success {
                info!(user_id=%user.id, version=?result.version_updated, "application update performed successfully");
            } else {
                info!(user_id=%user.id, "no update needed - already up to date");
            }

            let ip_arc = didhub_middleware::client_ip::get_request_ip();
            let ip = ip_arc.as_ref().map(|s| s.as_str());
            audit::record_with_metadata(
                &db,
                Some(user.id.as_str()),
                if result.success {
                    "admin.update.success"
                } else {
                    "admin.update.no_update"
                },
                Some("update"),
                result.version_updated.as_deref(),
                serde_json::json!({
                    "success": result.success,
                    "version_updated": result.version_updated,
                    "message": result.message
                }),
                ip,
            )
            .await;

            if result.success {
                tracing::info!(
                    version = result.version_updated.as_deref().unwrap_or("unknown"),
                    user_id = user.id,
                    "Application updated successfully, initiating restart"
                );

                restart_server().await;
            }

            Ok(Json(result))
        }
        Err(e) => {
            warn!(user_id=%user.id, error=%e, "update perform failed");
            tracing::error!(error = %e, "Failed to perform update");
            let ip_arc = didhub_middleware::client_ip::get_request_ip();
            let ip = ip_arc.as_ref().map(|s| s.as_str());
            audit::record_with_metadata(
                &db,
                Some(user.id.as_str()),
                "admin.update.failed",
                Some("update"),
                None,
                serde_json::json!({"error": e.to_string()}),
                ip,
            )
            .await;

            Ok(Json(UpdateResult {
                success: false,
                message: format!("Failed to perform update: {}", e),
                version_updated: None,
                restart_needed: false,
            }))
        }
    }
}

#[cfg(feature = "updater")]
async fn restart_server() {
    use std::env;
    use std::process::Command;
    use tokio::time::Duration;

    info!("Initiating server restart after update");

    let current_exe = match env::current_exe() {
        Ok(path) => path,
        Err(e) => {
            error!("Failed to get current executable path: {}", e);
            return;
        }
    };

    let args: Vec<String> = env::args().skip(1).collect();

    info!(
        "Restarting server with command: {} {:?}",
        current_exe.display(),
        args
    );

    info!("Shutting down current server process to release port");
    tokio::time::sleep(Duration::from_millis(500)).await;

    match Command::new(&current_exe).args(&args).spawn() {
        Ok(child) => {
            info!("New server process started with PID: {}", child.id());
            std::process::exit(0);
        }
        Err(e) => {
            error!("Failed to start new server process: {}", e);
            std::process::exit(1);
        }
    }
}

#[cfg(not(feature = "updater"))]
pub async fn perform_update_endpoint(
    Extension(user): Extension<CurrentUser>,
    Extension(db): Extension<Db>,
    Extension(_cfg): Extension<AppConfig>,
    Query(_query): Query<UpdateCheckQuery>,
) -> Result<Json<UpdateResult>, AppError> {
    if user.is_admin == 0 {
        warn!(user_id=%user.id, username=%user.username, "unauthorized attempt to perform updates (updater feature disabled)");
        return Err(AppError::Forbidden);
    }

    tracing::debug!(user_id=%user.id, "update perform attempted but updater feature not compiled in");
    let ip_arc = didhub_middleware::client_ip::get_request_ip();
    let ip = ip_arc.as_ref().map(|s| s.as_str());
    audit::record_with_metadata(
        &db,
        Some(user.id.as_str()),
        "admin.update.feature_disabled",
        Some("update"),
        None,
        serde_json::json!({"updater_feature": false}),
        ip,
    )
    .await;

    Ok(Json(UpdateResult {
        success: false,
        message: "Update functionality not compiled in. Build with --features updater to enable."
            .to_string(),
        version_updated: None,
        restart_needed: false,
    }))
}
