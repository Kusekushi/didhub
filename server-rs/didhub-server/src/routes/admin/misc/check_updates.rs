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
#[cfg(not(feature = "updater"))]
use tracing::debug;
#[cfg(feature = "updater")]
use tracing::info;
use tracing::warn;

use super::UpdateCheckQuery;

#[cfg(feature = "updater")]
use didhub_updater::{check_for_updates, get_version_info, UpdateConfig, UpdateStatus};

#[cfg(not(feature = "updater"))]
use super::{get_version_info, UpdateStatus};

#[cfg(feature = "updater")]
pub async fn check_updates(
    Extension(user): Extension<CurrentUser>,
    Extension(db): Extension<Db>,
    Extension(cfg): Extension<AppConfig>,
    Query(_query): Query<UpdateCheckQuery>,
) -> Result<Json<UpdateStatus>, AppError> {
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
        warn!(user_id=%user.id, "update check attempted but auto-updates are disabled");
        let ip_arc = didhub_middleware::client_ip::get_request_ip();
        let ip = ip_arc.as_ref().map(|s| s.as_str());
        audit::record_with_metadata(
            &db,
            Some(user.id.as_str()),
            "admin.update.check_disabled",
            Some("update"),
            None,
            serde_json::json!({"enabled": auto_update_enabled}),
            ip,
        )
        .await;

        return Ok(Json(UpdateStatus {
            available: false,
            current_version: env!("CARGO_PKG_VERSION").to_string(),
            latest_version: None,
            download_url: None,
            message: "Auto-updates are disabled. Set AUTO_UPDATE_ENABLED=true to enable."
                .to_string(),
            versions: get_version_info(),
        }));
    }

    let config = UpdateConfig::default();

    match check_for_updates(&config).await {
        Ok(status) => {
            info!(user_id=%user.id, update_available=%status.available, current_version=%status.current_version, latest_version=?status.latest_version, "update check completed");
            let ip_arc = didhub_middleware::client_ip::get_request_ip();
            let ip = ip_arc.as_ref().map(|s| s.as_str());
            audit::record_with_metadata(
                &db,
                Some(user.id.as_str()),
                "admin.update.check",
                Some("update"),
                None,
                serde_json::json!({
                    "available": status.available,
                    "current": status.current_version,
                    "latest": status.latest_version
                }),
                ip,
            )
            .await;

            Ok(Json(status))
        }
        Err(e) => {
            warn!(user_id=%user.id, error=%e, "update check failed");
            tracing::error!(error = %e, "Failed to check for updates");
            let ip_arc = didhub_middleware::client_ip::get_request_ip();
            let ip = ip_arc.as_ref().map(|s| s.as_str());
            audit::record_with_metadata(
                &db,
                Some(user.id.as_str()),
                "admin.update.check_failed",
                Some("update"),
                None,
                serde_json::json!({"error": e.to_string()}),
                ip,
            )
            .await;

            Ok(Json(UpdateStatus {
                available: false,
                current_version: config.current_version,
                latest_version: None,
                download_url: None,
                message: format!("Failed to check for updates: {}", e),
                versions: get_version_info(),
            }))
        }
    }
}

#[cfg(not(feature = "updater"))]
pub async fn check_updates(
    Extension(user): Extension<CurrentUser>,
    Extension(db): Extension<Db>,
    Extension(_cfg): Extension<AppConfig>,
    Query(_query): Query<UpdateCheckQuery>,
) -> Result<Json<UpdateStatus>, AppError> {
    if user.is_admin == 0 {
        warn!(user_id=%user.id, username=%user.username, "unauthorized attempt to check updates (updater feature disabled)");
        return Err(AppError::Forbidden);
    }

    debug!(user_id=%user.id, "update check attempted but updater feature not compiled in");
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

    Ok(Json(UpdateStatus {
        available: false,
        current_version: env!("CARGO_PKG_VERSION").to_string(),
        latest_version: None,
        download_url: None,
        message: "Update functionality not compiled in. Build with --features updater to enable."
            .to_string(),
        versions: get_version_info(),
    }))
}
