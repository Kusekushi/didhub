use axum::{extract::Path, Extension, Json};
use didhub_db::Db;
use didhub_error::AppError;
use didhub_middleware::types::CurrentUser;

use super::{get_provider_admin_view, is_valid_provider, ProviderAdminView};

pub async fn get_secret(
    Path(id): Path<String>,
    Extension(db): Extension<Db>,
    Extension(user): Extension<CurrentUser>,
) -> Result<Json<ProviderAdminView>, AppError> {
    if !user.is_admin {
        return Err(AppError::Forbidden);
    }
    if !is_valid_provider(&id) {
        return Err(AppError::NotFound);
    }

    get_provider_admin_view(&db, &id).await.map(Json)
}
