use axum::{
    extract::{Extension, Path, State},
    Json,
};
use didhub_db::users::UserOperations;
use didhub_db::{
    audit,
    models::{NewUserAlterRelationship, UserAlterRelationship},
};
use didhub_db::{user_alter_relationships::UserAlterRelationshipOperations, Db};
use didhub_error::AppError;
use didhub_middleware::types::CurrentUser;
use serde::Deserialize;
use tracing::{debug, info, warn};

#[derive(Deserialize)]
pub struct CreateRelationshipPayload {
    pub user_id: i64,
    pub relationship_type: String,
}

pub async fn create_relationship(
    State(db): State<Db>,
    Extension(user): Extension<CurrentUser>,
    Path(alter_id): Path<i64>,
    Json(payload): Json<CreateRelationshipPayload>,
) -> Result<Json<UserAlterRelationship>, AppError> {
    info!(
        "Creating user-alter relationship: alter_id={}, user_id={}, type={}",
        alter_id, payload.user_id, payload.relationship_type
    );

    // Validate relationship type
    if !["partner", "parent", "child"].contains(&payload.relationship_type.as_str()) {
        return Err(AppError::BadRequest(
            "Invalid relationship type. Must be 'partner', 'parent', or 'child'".to_string(),
        ));
    }

    // Validate that the target user is not a system user
    let target_user = db
        .fetch_user_by_id(payload.user_id)
        .await
        .map_err(|_| AppError::Internal)?
        .ok_or_else(|| AppError::BadRequest("Target user not found".to_string()))?;

    if target_user.is_system != 0 {
        warn!(
            "Attempted to create relationship with system user: {}",
            payload.user_id
        );
        return Err(AppError::BadRequest(
            "Cannot create relationships with system users".to_string(),
        ));
    }

    // Check if user has permission to modify this alter
    // For now, allow any authenticated user to create relationships
    // TODO: Add proper permission checks based on alter ownership

    let new_relationship = NewUserAlterRelationship {
        user_id: payload.user_id,
        alter_id,
        relationship_type: payload.relationship_type.clone(),
    };

    let relationship = db.create_user_alter_relationship(&new_relationship).await?;
    info!("Created user-alter relationship: id={}", relationship.id);

    audit::record_entity(
        &db,
        Some(user.id),
        "user_alter_relationship.create",
        "user_alter_relationship",
        &relationship.id.to_string(),
    )
    .await;

    info!(user_id=%user.id, alter_id=%alter_id, relationship_type=%payload.relationship_type, "user-alter relationship created");

    Ok(Json(relationship))
}

pub async fn delete_relationship(
    State(db): State<Db>,
    Extension(user): Extension<CurrentUser>,
    Path((alter_id, user_id, relationship_type)): Path<(i64, i64, String)>,
) -> Result<(), AppError> {
    // Validate relationship type
    if !["partner", "parent", "child"].contains(&relationship_type.as_str()) {
        return Err(AppError::BadRequest(
            "Invalid relationship type. Must be 'partner', 'parent', or 'child'".to_string(),
        ));
    }

    // Check if user has permission to modify this alter
    // For now, allow any authenticated user to delete relationships
    // TODO: Add proper permission checks

    let deleted = db
        .delete_user_alter_relationship(user_id, alter_id, &relationship_type)
        .await?;

    if deleted {
        audit::record_entity(
            &db,
            Some(user.id),
            "user_alter_relationship.delete",
            "user_alter_relationship",
            &format!("{}_{}_{}", user_id, alter_id, relationship_type),
        )
        .await;
        info!(user_id=%user.id, alter_id=%alter_id, relationship_type=%relationship_type, "user-alter relationship deleted");
    }

    Ok(())
}

pub async fn list_relationships(
    State(db): State<Db>,
    Extension(user): Extension<CurrentUser>,
    Path(alter_id): Path<i64>,
) -> Result<Json<Vec<UserAlterRelationship>>, AppError> {
    // Check if user has permission to view this alter
    // For now, allow any authenticated user to view relationships
    // TODO: Add proper permission checks

    let relationships = db.list_user_alter_relationships_by_alter(alter_id).await?;

    debug!(user_id=%user.id, alter_id=%alter_id, count=%relationships.len(), "listed user-alter relationships");

    Ok(Json(relationships))
}
