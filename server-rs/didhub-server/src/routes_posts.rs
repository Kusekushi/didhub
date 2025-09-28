use axum::{
    extract::{Extension, Path, Query},
    Json,
};
use didhub_db::audit;
use didhub_db::posts::PostOperations;
use didhub_db::Db;
use didhub_error::AppError;
use didhub_middleware::types::CurrentUser;
use serde::Deserialize;
use tracing::{debug, info, warn};

#[derive(Deserialize)]
pub struct ListParams {
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

pub async fn list_posts(
    Extension(db): Extension<Db>,
    Query(p): Query<ListParams>,
) -> Result<Json<serde_json::Value>, AppError> {
    let limit = p.limit.unwrap_or(50).clamp(1, 200);
    let offset = p.offset.unwrap_or(0).max(0);
    debug!(limit=%limit, offset=%offset, "listing posts");
    let posts = db
        .list_posts(limit, offset)
        .await
        .map_err(|_| AppError::Internal)?;
    debug!(post_count=%posts.len(), "posts listed successfully");
    Ok(Json(serde_json::json!({"items": posts})))
}

#[derive(Deserialize)]
pub struct CreatePostBody {
    pub body: String,
}

pub async fn create_post(
    Extension(db): Extension<Db>,
    Extension(user): Extension<CurrentUser>,
    Json(body): Json<CreatePostBody>,
) -> Result<Json<serde_json::Value>, AppError> {
    if !user.is_admin && !user.is_system {
        warn!(user_id=%user.id, username=%user.username, "unauthorized post creation attempt");
        return Err(AppError::Forbidden);
    }
    debug!(user_id=%user.id, username=%user.username, body_length=%body.body.len(), "creating post");
    let post = db
        .create_post(&body.body, Some(user.id))
        .await
        .map_err(|_| AppError::Internal)?;
    info!(user_id=%user.id, username=%user.username, post_id=%post.id, "post created successfully");
    audit::record_entity(
        &db,
        Some(user.id),
        "post.create",
        "post",
        &post.id.to_string(),
    )
    .await;
    Ok(Json(serde_json::json!({"item": post})))
}

pub async fn repost_post(
    Extension(db): Extension<Db>,
    Extension(user): Extension<CurrentUser>,
    Path(id): Path<i64>,
) -> Result<Json<serde_json::Value>, AppError> {
    if !user.is_admin && !user.is_system {
        warn!(user_id=%user.id, username=%user.username, post_id=%id, "unauthorized repost attempt");
        return Err(AppError::Forbidden);
    }
    debug!(user_id=%user.id, username=%user.username, original_post_id=%id, "reposting post");
    let Some(post) = db
        .repost_post(id, Some(user.id))
        .await
        .map_err(|_| AppError::Internal)?
    else {
        warn!(user_id=%user.id, username=%user.username, original_post_id=%id, "repost failed - original post not found");
        return Err(AppError::NotFound);
    };
    info!(user_id=%user.id, username=%user.username, original_post_id=%id, new_post_id=%post.id, "post reposted successfully");
    audit::record_with_metadata(
        &db,
        Some(user.id),
        "post.repost",
        Some("post"),
        Some(&post.id.to_string()),
        serde_json::json!({"repost_of": id}),
    )
    .await;
    Ok(Json(serde_json::json!({"item": post})))
}
// Removed internal_err helper; using AppError::Internal mapping.

pub async fn delete_post(
    Extension(db): Extension<Db>,
    Extension(user): Extension<CurrentUser>,
    Path(id): Path<i64>,
) -> Result<Json<serde_json::Value>, AppError> {
    if !user.is_admin && !user.is_system {
        warn!(user_id=%user.id, username=%user.username, post_id=%id, "unauthorized post deletion attempt");
        return Err(AppError::Forbidden);
    }
    debug!(user_id=%user.id, username=%user.username, post_id=%id, "deleting post");
    let deleted = db.delete_post(id).await.map_err(|_| AppError::Internal)?;
    if !deleted {
        warn!(user_id=%user.id, username=%user.username, post_id=%id, "post deletion failed - post not found");
        return Err(AppError::NotFound);
    }
    info!(user_id=%user.id, username=%user.username, post_id=%id, "post deleted successfully");
    audit::record_entity(&db, Some(user.id), "post.delete", "post", &id.to_string()).await;
    Ok(Json(serde_json::json!({"ok": true, "id": id})))
}
