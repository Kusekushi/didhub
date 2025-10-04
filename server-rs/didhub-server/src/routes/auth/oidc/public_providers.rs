use axum::{Extension, Json};
use didhub_db::Db;
use didhub_error::AppError;

use super::{get_global_oidc_enabled, get_provider_config, provider_catalog, OidcPublicProvider};

pub async fn public_providers(
    Extension(db): Extension<Db>,
) -> Result<Json<Vec<OidcPublicProvider>>, AppError> {
    let globally_enabled = get_global_oidc_enabled(&db).await?;
    if !globally_enabled {
        return Ok(Json(vec![]));
    }

    let mut list = Vec::new();
    for (id, name) in provider_catalog() {
        let config = get_provider_config(&db, &id).await?;
        if config.enabled {
            list.push(OidcPublicProvider { id, name });
        }
    }

    Ok(Json(list))
}
