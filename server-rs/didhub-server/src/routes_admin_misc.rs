use crate::upload_dir::UploadDirCache;
use axum::{
    extract::{Extension, Query},
    Json,
};
use didhub_cache::AppCache;
use didhub_config::AppConfig;
use didhub_db::audit;
use didhub_db::{alters::AlterOperations, settings::SettingOperations, Db};
use didhub_error::AppError;
use didhub_middleware::types::CurrentUser;
use sqlx::{Column, Row, ValueRef};
use tracing::{debug, error, info, warn};

#[cfg(feature = "updater")]
use didhub_updater::{
    check_for_updates, get_version_info, perform_update, UpdateConfig, UpdateResult, UpdateStatus,
};

include!(concat!(env!("OUT_DIR"), "/versions.rs"));

#[cfg(not(feature = "updater"))]
#[derive(Debug, serde::Serialize)]
pub struct VersionInfo {
    pub server: String,
    pub db: String,
    pub auth: String,
    pub cache: String,
    pub error: String,
    pub config: String,
    pub oidc: String,
    pub metrics: String,
    pub housekeeping: String,
    pub middleware: String,
    pub updater: String,
    pub migrations: String,
    pub frontend: String,
}

#[cfg(not(feature = "updater"))]
#[derive(Debug, serde::Serialize)]
pub struct UpdateStatus {
    pub available: bool,
    pub current_version: String,
    pub latest_version: Option<String>,
    pub download_url: Option<String>,
    pub message: String,
    pub versions: VersionInfo,
}

#[cfg(not(feature = "updater"))]
fn get_version_info() -> VersionInfo {
    VersionInfo {
        server: SERVER_VERSION.to_string(),
        db: DB_VERSION.to_string(),
        auth: AUTH_VERSION.to_string(),
        cache: CACHE_VERSION.to_string(),
        error: ERROR_VERSION.to_string(),
        config: CONFIG_VERSION.to_string(),
        oidc: OIDC_VERSION.to_string(),
        metrics: METRICS_VERSION.to_string(),
        housekeeping: HOUSEKEEPING_VERSION.to_string(),
        middleware: MIDDLEWARE_VERSION.to_string(),
        updater: UPDATER_VERSION.to_string(),
        migrations: MIGRATIONS_VERSION.to_string(),
        frontend: FRONTEND_VERSION.to_string(),
    }
}

#[cfg(not(feature = "updater"))]
#[derive(Debug, serde::Serialize)]
pub struct UpdateResult {
    pub success: bool,
    pub message: String,
    pub version_updated: Option<String>,
    pub restart_needed: bool,
}

#[derive(serde::Serialize)]
pub struct ReloadResp {
    pub ok: bool,
    pub dir: String,
}

pub async fn reload_upload_dir(
    Extension(user): Extension<CurrentUser>,
    Extension(udc): Extension<UploadDirCache>,
    Extension(db): Extension<Db>,
) -> Result<Json<ReloadResp>, AppError> {
    if !user.is_admin {
        warn!(user_id=%user.id, username=%user.username, "unauthorized attempt to reload upload directory");
        return Err(AppError::Forbidden);
    }
    debug!(user_id=%user.id, "reloading upload directory");
    udc.invalidate().await;
    let dir = udc.current().await;
    info!(user_id=%user.id, upload_dir=%dir, "upload directory reloaded");
    audit::record_with_metadata(
        &db,
        Some(user.id),
        "admin.upload_dir.reload",
        Some("upload_dir"),
        Some(&dir),
        serde_json::json!({"dir": dir}),
    )
    .await;
    Ok(Json(ReloadResp { ok: true, dir }))
}

#[derive(serde::Serialize)]
pub struct MigrateResp {
    pub ok: bool,
    pub moved: usize,
    pub skipped: usize,
}

pub async fn migrate_uploads(
    Extension(user): Extension<CurrentUser>,
    Extension(udc): Extension<UploadDirCache>,
    Extension(db): Extension<Db>,
) -> Result<Json<MigrateResp>, AppError> {
    if !user.is_admin {
        warn!(user_id=%user.id, username=%user.username, "unauthorized attempt to migrate uploads");
        return Err(AppError::Forbidden);
    }
    debug!(user_id=%user.id, "migrating uploads to current directory");
    let (moved, skipped) = udc
        .migrate_previous_to_current()
        .await
        .map_err(|_| AppError::Internal)?;
    info!(user_id=%user.id, moved=%moved, skipped=%skipped, "upload migration completed");
    audit::record_with_metadata(
        &db,
        Some(user.id),
        "admin.upload_dir.migrate",
        Some("upload_dir"),
        None,
        serde_json::json!({"moved": moved, "skipped": skipped}),
    )
    .await;
    Ok(Json(MigrateResp {
        ok: true,
        moved,
        skipped,
    }))
}

#[derive(serde::Serialize)]
pub struct RedisStatusResp {
    pub ok: bool,
    pub mode: String,
    pub error: Option<String>,
    pub info: Option<std::collections::HashMap<String, String>>,
}

pub async fn redis_status(
    Extension(user): Extension<CurrentUser>,
    Extension(cache): Extension<AppCache>,
) -> Result<Json<RedisStatusResp>, AppError> {
    if !user.is_admin {
        warn!(user_id=%user.id, username=%user.username, "unauthorized attempt to check Redis status");
        return Err(AppError::Forbidden);
    }
    debug!(user_id=%user.id, "checking Redis status");
    let kind = cache.backend_kind();
    if kind == "memory" {
        debug!(user_id=%user.id, backend=%kind, "Redis status checked - using in-memory cache");
        return Ok(Json(RedisStatusResp {
            ok: false,
            mode: kind.into(),
            error: Some("no-redis".into()),
            info: None,
        }));
    }
    if let Some(manager) = cache.as_redis_manager() {
        let mut guard = manager.lock().await;
        let pong: Result<String, _> = redis::cmd("PING").query_async(&mut *guard).await;
        let mut info_map: Option<std::collections::HashMap<String, String>> = None;
        if pong.is_ok() {
            let raw: Result<String, _> = redis::cmd("INFO")
                .arg("server")
                .arg("clients")
                .arg("memory")
                .arg("stats")
                .arg("keyspace")
                .query_async(&mut *guard)
                .await;
            if let Ok(txt) = raw {
                let mut map = std::collections::HashMap::new();
                for line in txt.lines() {
                    if line.starts_with('#') || line.trim().is_empty() {
                        continue;
                    }
                    if let Some((k, v)) = line.split_once(':') {
                        map.insert(k.trim().to_string(), v.trim().to_string());
                    }
                }
                info_map = Some(map);
            }
        }
        return Ok(match pong {
            Ok(p) => {
                let is_ok = p.to_uppercase() == "PONG";
                debug!(user_id=%user.id, backend=%kind, ping_success=%is_ok, "Redis status checked successfully");
                Json(RedisStatusResp {
                    ok: is_ok,
                    mode: kind.into(),
                    error: None,
                    info: info_map,
                })
            }
            Err(_) => {
                warn!(user_id=%user.id, backend=%kind, "Redis ping failed");
                Json(RedisStatusResp {
                    ok: false,
                    mode: kind.into(),
                    error: Some("ping-failed".into()),
                    info: info_map,
                })
            }
        });
    }
    Ok(Json(RedisStatusResp {
        ok: false,
        mode: kind.into(),
        error: Some("unknown".into()),
        info: None,
    }))
}

#[derive(serde::Deserialize)]
pub struct UpdateCheckQuery {
    #[serde(default)]
    pub check_only: bool,
}

// Check for updates endpoint
#[cfg(feature = "updater")]
pub async fn check_updates(
    Extension(user): Extension<CurrentUser>,
    Extension(db): Extension<Db>,
    Extension(cfg): Extension<AppConfig>,
    Query(_query): Query<UpdateCheckQuery>,
) -> Result<Json<UpdateStatus>, AppError> {
    if !user.is_admin {
        return Err(AppError::Forbidden);
    }

    // Check if auto updates are enabled, preferring DB setting over config
    let auto_update_enabled = match db.get_setting("auto_update_enabled").await {
        Ok(Some(setting)) => {
            // Parse as string first, then convert to boolean like other settings
            match serde_json::from_str::<String>(&setting.value) {
                Ok(s) => matches!(s.as_str(), "1" | "true" | "yes"),
                _ => cfg.auto_update_enabled,
            }
        }
        _ => cfg.auto_update_enabled,
    };

    if !auto_update_enabled {
        warn!(user_id=%user.id, "update check attempted but auto-updates are disabled");
        audit::record_with_metadata(
            &db,
            Some(user.id),
            "admin.update.check_disabled",
            Some("update"),
            None,
            serde_json::json!({"enabled": auto_update_enabled}),
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
            audit::record_with_metadata(
                &db,
                Some(user.id),
                "admin.update.check",
                Some("update"),
                None,
                serde_json::json!({
                    "available": status.available,
                    "current": status.current_version,
                    "latest": status.latest_version
                }),
            )
            .await;

            Ok(Json(status))
        }
        Err(e) => {
            warn!(user_id=%user.id, error=%e, "update check failed");
            tracing::error!(error = %e, "Failed to check for updates");
            audit::record_with_metadata(
                &db,
                Some(user.id),
                "admin.update.check_failed",
                Some("update"),
                None,
                serde_json::json!({"error": e.to_string()}),
            )
            .await;

            Ok(Json(UpdateStatus {
                available: false,
                current_version: config.current_version,
                latest_version: None,
                download_url: None,
                message: format!("Failed to check for updates: {}", e),
                versions: didhub_updater::get_version_info(),
            }))
        }
    }
}

// Perform update endpoint
#[cfg(feature = "updater")]
pub async fn perform_update_endpoint(
    Extension(user): Extension<CurrentUser>,
    Extension(db): Extension<Db>,
    Extension(cfg): Extension<AppConfig>,
    Query(query): Query<UpdateCheckQuery>,
) -> Result<Json<UpdateResult>, AppError> {
    if !user.is_admin {
        return Err(AppError::Forbidden);
    }

    // Check if auto updates are enabled, preferring DB setting over config
    let auto_update_enabled = match db.get_setting("auto_update_enabled").await {
        Ok(Some(setting)) => {
            // Parse as string first, then convert to boolean like other settings
            match serde_json::from_str::<String>(&setting.value) {
                Ok(s) => matches!(s.as_str(), "1" | "true" | "yes"),
                _ => cfg.auto_update_enabled,
            }
        }
        _ => cfg.auto_update_enabled,
    };

    if !auto_update_enabled {
        warn!(user_id=%user.id, "update perform attempted but auto-updates are disabled");
        audit::record_with_metadata(
            &db,
            Some(user.id),
            "admin.update.disabled",
            Some("update"),
            None,
            serde_json::json!({"enabled": auto_update_enabled}),
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

    // If check_only is true, just check for updates without performing them
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
            audit::record_with_metadata(
                &db,
                Some(user.id),
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
            )
            .await;

            if result.success {
                tracing::info!(
                    version = result.version_updated.as_deref().unwrap_or("unknown"),
                    user_id = user.id,
                    "Application updated successfully, initiating restart"
                );

                // Initiate restart (this will exit the current process)
                restart_server().await;
            }

            Ok(Json(result))
        }
        Err(e) => {
            warn!(user_id=%user.id, error=%e, "update perform failed");
            tracing::error!(error = %e, "Failed to perform update");
            audit::record_with_metadata(
                &db,
                Some(user.id),
                "admin.update.failed",
                Some("update"),
                None,
                serde_json::json!({"error": e.to_string()}),
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

// Non-updater feature stubs
#[cfg(not(feature = "updater"))]
pub async fn check_updates(
    Extension(user): Extension<CurrentUser>,
    Extension(db): Extension<Db>,
    Extension(_cfg): Extension<AppConfig>,
    Query(_query): Query<UpdateCheckQuery>,
) -> Result<Json<UpdateStatus>, AppError> {
    if !user.is_admin {
        warn!(user_id=%user.id, username=%user.username, "unauthorized attempt to check updates (updater feature disabled)");
        return Err(AppError::Forbidden);
    }

    debug!(user_id=%user.id, "update check attempted but updater feature not compiled in");
    audit::record_with_metadata(
        &db,
        Some(user.id),
        "admin.update.feature_disabled",
        Some("update"),
        None,
        serde_json::json!({"updater_feature": false}),
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

#[cfg(not(feature = "updater"))]
pub async fn perform_update_endpoint(
    Extension(user): Extension<CurrentUser>,
    Extension(db): Extension<Db>,
    Extension(_cfg): Extension<AppConfig>,
    Query(_query): Query<UpdateCheckQuery>,
) -> Result<Json<UpdateResult>, AppError> {
    if !user.is_admin {
        warn!(user_id=%user.id, username=%user.username, "unauthorized attempt to perform updates (updater feature disabled)");
        return Err(AppError::Forbidden);
    }

    debug!(user_id=%user.id, "update perform attempted but updater feature not compiled in");
    audit::record_with_metadata(
        &db,
        Some(user.id),
        "admin.update.feature_disabled",
        Some("update"),
        None,
        serde_json::json!({"updater_feature": false}),
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

#[derive(serde::Deserialize)]
pub struct CustomDigestQuery {
    pub days_ahead: Option<i64>,
}

#[derive(serde::Serialize)]
pub struct DigestResponse {
    pub posted: bool,
    pub count: i64,
    pub message: String,
}

pub async fn post_custom_digest(
    Extension(user): Extension<CurrentUser>,
    Extension(db): Extension<Db>,
    Query(q): Query<CustomDigestQuery>,
) -> Result<Json<DigestResponse>, AppError> {
    if !user.is_admin {
        warn!(user_id=%user.id, username=%user.username, "unauthorized attempt to post custom digest");
        return Err(AppError::Forbidden);
    }

    let days_ahead = q.days_ahead.unwrap_or(7).max(1).min(365); // Clamp between 1-365 days

    debug!(user_id=%user.id, days_ahead=%days_ahead, "posting custom digest");

    // Check webhook presence (try new key first, fall back to old key for compatibility)
    let webhook = db.get_setting("discord_webhook_url").await?;
    let webhook = if webhook.is_none() {
        db.get_setting("discord.webhook").await?
    } else {
        webhook
    };
    if webhook.is_none() {
        return Ok(Json(DigestResponse {
            posted: false,
            count: 0,
            message: "no webhook configured".into(),
        }));
    }

    let alters = db.upcoming_birthdays(days_ahead).await.unwrap_or_default();
    if alters.is_empty() {
        return Ok(Json(DigestResponse {
            posted: false,
            count: 0,
            message: format!("no upcoming birthdays in next {} days", days_ahead),
        }));
    }

    let names: Vec<String> = alters
        .iter()
        .map(|a| {
            if let Some(b) = &a.birthday {
                format!("{} ({})", a.name, b)
            } else {
                a.name.clone()
            }
        })
        .collect();

    // Record audit entry (same as the regular digest job)
    audit::record_with_metadata(
        &db,
        Some(user.id),
        "digest.birthdays.custom",
        Some("digest"),
        None,
        serde_json::json!({
            "count": names.len(),
            "entries": names,
            "days_ahead": days_ahead,
            "custom": true
        }),
    )
    .await;

    warn!(user_id=%user.id, count=%names.len(), days_ahead=%days_ahead, "custom digest unimplemented");

    info!(user_id=%user.id, count=%names.len(), days_ahead=%days_ahead, "custom digest posted successfully");

    Ok(Json(DigestResponse {
        posted: true,
        count: alters.len() as i64,
        message: format!(
            "Custom digest posted with {} birthdays for next {} days",
            alters.len(),
            days_ahead
        ),
    }))
}

/// Query the database with a custom SQL statement (admin only)
#[derive(serde::Deserialize)]
pub struct QueryRequest {
    pub sql: String,
    pub limit: Option<i64>,
}

#[derive(serde::Serialize)]
pub struct QueryResponse {
    pub success: bool,
    pub columns: Vec<String>,
    pub rows: Vec<serde_json::Value>,
    pub row_count: usize,
    pub message: Option<String>,
}

pub async fn query_database(
    Extension(user): Extension<CurrentUser>,
    Extension(db): Extension<Db>,
    Json(req): Json<QueryRequest>,
) -> Result<Json<QueryResponse>, AppError> {
    if !user.is_admin {
        warn!(user_id=%user.id, username=%user.username, "unauthorized attempt to query database");
        return Err(AppError::Forbidden);
    }

    let sql = req.sql.trim().to_uppercase();
    if !sql.starts_with("SELECT") {
        return Ok(Json(QueryResponse {
            success: false,
            columns: vec![],
            rows: vec![],
            row_count: 0,
            message: Some("Only SELECT queries are allowed".to_string()),
        }));
    }

    debug!(user_id=%user.id, sql=%req.sql, "executing database query");

    let limit = req.limit.unwrap_or(1000).min(10000); // Cap at 10k rows

    // Use sqlx::query to execute the query
    let rows = sqlx::query(&req.sql)
        .fetch_all(&db.pool)
        .await
        .map_err(|e| {
            error!(user_id=%user.id, sql=%req.sql, error=%e, "database query failed");
            AppError::BadRequest(format!("Query failed: {}", e))
        })?;

    let row_count = rows.len();
    let limited_rows: Vec<_> = rows.into_iter().take(limit as usize).collect();

    let mut columns: Vec<String> = vec![];
    let mut json_rows = vec![];

    if let Some(first_row) = limited_rows.first() {
        columns = (0..first_row.len()).map(|i| first_row.column(i).name().to_string()).collect();
    }

    for row in limited_rows {
        let mut json_row = serde_json::Map::new();
        for (i, column) in columns.iter().enumerate() {
            let value: serde_json::Value = match row.try_get_raw(i) {
                Ok(raw) => {
                    if raw.is_null() {
                        serde_json::Value::Null
                    } else if let Ok(v) = row.try_get::<String, _>(i) {
                        serde_json::Value::String(v)
                    } else if let Ok(v) = row.try_get::<i64, _>(i) {
                        serde_json::Value::Number(v.into())
                    } else if let Ok(v) = row.try_get::<f64, _>(i) {
                        serde_json::Number::from_f64(v).map_or(serde_json::Value::Null, serde_json::Value::Number)
                    } else if let Ok(v) = row.try_get::<bool, _>(i) {
                        serde_json::Value::Bool(v)
                    } else {
                        serde_json::Value::String(format!("{:?}", raw))
                    }
                }
                Err(_) => serde_json::Value::Null,
            };
            json_row.insert(column.clone(), value);
        }
        json_rows.push(serde_json::Value::Object(json_row));
    }

    info!(user_id=%user.id, row_count=%row_count, "database query executed successfully");

    audit::record_with_metadata(
        &db,
        Some(user.id),
        "admin.db.query",
        Some("database"),
        None,
        serde_json::json!({
            "sql": req.sql,
            "row_count": row_count,
            "limited": row_count > limit as usize
        }),
    )
    .await;

    Ok(Json(QueryResponse {
        success: true,
        columns,
        rows: json_rows,
        row_count,
        message: if row_count > limit as usize {
            Some(format!("Results limited to {} rows", limit))
        } else {
            None
        },
    }))
}

/// Restart the server process after a successful update
async fn restart_server() {
    use std::env;
    use std::process::Command;
    use tokio::time::Duration;

    info!("Initiating server restart after update");

    // Get the current executable path
    let current_exe = match env::current_exe() {
        Ok(path) => path,
        Err(e) => {
            error!("Failed to get current executable path: {}", e);
            return;
        }
    };

    // Get the command line arguments (skip the first one which is the executable path)
    let args: Vec<String> = env::args().skip(1).collect();

    info!(
        "Restarting server with command: {} {:?}",
        current_exe.display(),
        args
    );

    // Exit the current process first to release the port
    info!("Shutting down current server process to release port");
    tokio::time::sleep(Duration::from_millis(500)).await; // Brief pause to ensure cleanup

    // Spawn the new process after the old one has exited
    match Command::new(&current_exe).args(&args).spawn() {
        Ok(child) => {
            info!("New server process started with PID: {}", child.id());
            std::process::exit(0);
        }
        Err(e) => {
            error!("Failed to start new server process: {}", e);
            // If we can't start the new process, exit anyway since the old one is already gone
            std::process::exit(1);
        }
    }
}
