use axum::{extract::Path, Extension, Json};
use didhub_db::settings::SettingOperations;
use didhub_db::{audit, Db};
use didhub_error::AppError;
use didhub_metrics::OIDC_SECRET_UPDATE_TOTAL;
use didhub_middleware::types::CurrentUser;

use super::{
    client_id_key, client_secret_key, get_provider_admin_view, is_valid_provider, setting_key,
    ProviderAdminView, UpdateSecretBody,
};

pub async fn update_secret(
    Path(id): Path<String>,
    Extension(db): Extension<Db>,
    Extension(user): Extension<CurrentUser>,
    Json(body): Json<UpdateSecretBody>,
) -> Result<Json<ProviderAdminView>, AppError> {
    if !user.is_admin {
        return Err(AppError::Forbidden);
    }
    if !is_valid_provider(&id) {
        return Err(AppError::NotFound);
    }

    let mut client_id_changed = false;
    let mut secret_changed = false;

    if let Some(ref cid) = body.client_id {
        let serialized = serde_json::to_string(&serde_json::json!(cid)).unwrap();
        db.upsert_setting(&client_id_key(&id), &serialized)
            .await
            .map_err(|_| AppError::Internal)?;
        client_id_changed = true;
    }

    if let Some(ref secret) = body.client_secret {
        let serialized = serde_json::to_string(&serde_json::json!(secret)).unwrap();
        db.upsert_setting(&client_secret_key(&id), &serialized)
            .await
            .map_err(|_| AppError::Internal)?;
        secret_changed = true;
    }

    if let Some(enabled) = body.enabled {
        let serialized = serde_json::to_string(&serde_json::json!(enabled)).unwrap();
        db.upsert_setting(&setting_key(&id), &serialized)
            .await
            .map_err(|_| AppError::Internal)?;
    }

    audit::record_with_metadata(
        &db,
        Some(user.id),
        "oidc.secret.update",
        Some("oidc_provider"),
        Some(&id),
        serde_json::json!({
            "client_id_changed": client_id_changed,
            "secret_changed": secret_changed
        }),
    )
    .await;

    if client_id_changed || secret_changed {
        OIDC_SECRET_UPDATE_TOTAL
            .with_label_values(&[id.as_str()])
            .inc();
    }

    get_provider_admin_view(&db, &id).await.map(Json)
}
