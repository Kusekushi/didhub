use axum::extract::{Extension, State};
use axum::Json;
use didhub_db::users::UserOperations;
use didhub_db::{Db, UpdateUserFields};
use didhub_error::AppError;
use didhub_middleware::types::CurrentUser;
use serde::{Deserialize, Serialize};

#[derive(Serialize)]
pub struct ProfileResponse {
    pub id: String,
    pub username: String,
    pub about_me: Option<String>,
}

#[derive(Deserialize)]
pub struct UpdateProfilePayload {
    pub about_me: Option<Option<String>>, // Some(Some) set, Some(None) clear, None ignore
}

pub async fn get_profile(
    State(db): State<Db>,
    Extension(current): Extension<CurrentUser>,
) -> Result<Json<ProfileResponse>, AppError> {
    let u = db
        .fetch_user_by_id(&current.id)
        .await
        .map_err(|_| AppError::Internal)?
        .ok_or(AppError::NotFound)?;
    Ok(Json(ProfileResponse {
        id: u.id,
        username: u.username,
        about_me: u.about_me,
    }))
}

pub async fn update_profile(
    State(db): State<Db>,
    Extension(current): Extension<CurrentUser>,
    Json(payload): Json<UpdateProfilePayload>,
) -> Result<Json<ProfileResponse>, AppError> {
    let mut fields = UpdateUserFields::default();
    fields.about_me = payload.about_me;
    let u = db
        .update_user(&current.id, fields)
        .await
        .map_err(|_| AppError::Internal)?
        .ok_or(AppError::NotFound)?;
    Ok(Json(ProfileResponse {
        id: u.id,
        username: u.username,
        about_me: u.about_me,
    }))
}
