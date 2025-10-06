use std::collections::HashMap;

use axum::{extract::Extension, Json};
use didhub_cache::{AppCache, Cache};
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

    let ping_ok = cache.ping().await.unwrap_or(false);
    let info_map = cache.get_info().await.unwrap_or(None);

    if ping_ok {
        debug!(user_id=%user.id, backend=%kind, ping_success=%ping_ok, "Redis status checked successfully");
        Ok(Json(RedisStatusResp {
            ok: true,
            mode: kind.into(),
            error: None,
            info: info_map,
        }))
    } else {
        warn!(user_id=%user.id, backend=%kind, "Redis ping failed");
        Ok(Json(RedisStatusResp {
            ok: false,
            mode: kind.into(),
            error: Some("ping-failed".into()),
            info: info_map,
        }))
    }
}
