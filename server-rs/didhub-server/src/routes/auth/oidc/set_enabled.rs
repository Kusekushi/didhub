use axum::{extract::Path, Extension, Json};
use didhub_db::settings::SettingOperations;
use didhub_db::Db;
use didhub_error::AppError;
use didhub_middleware::types::CurrentUser;

use super::{get_provider_name, is_valid_provider, setting_key, EnableBody, OidcProviderInfo};

pub async fn set_enabled(
    Extension(db): Extension<Db>,
    Extension(user): Extension<CurrentUser>,
    Path(id): Path<String>,
    Json(body): Json<EnableBody>,
) -> Result<Json<OidcProviderInfo>, AppError> {
    if !user.is_admin {
        return Err(AppError::Forbidden);
    }
    if !is_valid_provider(&id) {
        return Err(AppError::NotFound);
    }

    let key = setting_key(&id);
    let serialized = serde_json::to_string(&serde_json::json!(body.enabled)).unwrap();
    db.upsert_setting(&key, &serialized)
        .await
        .map_err(|_| AppError::Internal)?;

    let name = get_provider_name(&id).to_string();
    Ok(Json(OidcProviderInfo {
        id,
        name,
        enabled: body.enabled,
    }))
}
