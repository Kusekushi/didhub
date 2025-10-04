use std::collections::HashMap;

use axum::{extract::Extension, Json};
use didhub_cache::AppCache;
use didhub_error::AppError;
use didhub_middleware::types::CurrentUser;
use tracing::{debug, warn};

#[derive(serde::Serialize)]
pub struct RedisStatusResp {
    pub ok: bool,
    pub mode: String,
    pub error: Option<String>,
    pub info: Option<HashMap<String, String>>,
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
        let mut info_map: Option<HashMap<String, String>> = None;

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
                let mut map = HashMap::new();
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
