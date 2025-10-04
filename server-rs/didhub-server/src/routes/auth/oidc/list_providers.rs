use axum::{Extension, Json};
use didhub_db::Db;
use didhub_error::AppError;
use didhub_middleware::types::CurrentUser;

use super::{get_provider_config, provider_catalog, OidcProviderInfo};

pub async fn list_providers(
    Extension(db): Extension<Db>,
    Extension(user): Extension<CurrentUser>,
) -> Result<Json<Vec<OidcProviderInfo>>, AppError> {
    if !user.is_admin {
        return Err(AppError::Forbidden);
    }

    let mut providers = Vec::new();
    for (id, name) in provider_catalog() {
        let config = get_provider_config(&db, &id).await?;
        providers.push(OidcProviderInfo {
            id,
            name,
            enabled: config.enabled,
        });
    }

    Ok(Json(providers))
}
