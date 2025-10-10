use axum::{
    extract::{Extension, Path, State},
    Json,
};
use didhub_db::{alters::AlterOperations, users::UserOperations};
use didhub_db::{
    audit,
    models::{NewUserAlterRelationship, UserAlterRelationship},
};
use didhub_db::{user_alter_relationships::UserAlterRelationshipOperations, Db};
use didhub_error::AppError;
use didhub_middleware::types::CurrentUser;
use serde::Deserialize;
use std::collections::{HashMap, HashSet};
use tracing::{debug, info, warn};

#[derive(Deserialize)]
pub struct CreateRelationshipPayload {
    pub user_id: String,
    pub relationship_type: String,
}

#[derive(Deserialize)]
pub struct ReplaceRelationshipsPayload {
    #[serde(default)]
    pub partners: Vec<String>,
    #[serde(default)]
    pub parents: Vec<String>,
    #[serde(default)]
    pub children: Vec<String>,
}

pub async fn create_relationship(
    State(db): State<Db>,
    Extension(user): Extension<CurrentUser>,
    Path(alter_id): Path<String>,
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
        .fetch_user_by_id(&payload.user_id)
        .await
        .map_err(|_| AppError::Internal)?
        .ok_or_else(|| AppError::BadRequest("Target user not found".to_string()))?;

    if target_user.is_system == 1 {
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
        user_id: payload.user_id.clone(),
        alter_id: alter_id.clone(),
        relationship_type: payload.relationship_type.clone(),
    };

    let relationship = db.create_user_alter_relationship(&new_relationship).await?;
    info!("Created user-alter relationship: id={}", relationship.id);

    audit::record_entity(
        &db,
        Some(user.id.as_str()),
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
    Path((alter_id, user_id, relationship_type)): Path<(String, String, String)>,
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
        .delete_user_alter_relationship(&user_id, &alter_id, &relationship_type)
        .await?;

    if deleted {
        audit::record_entity(
            &db,
            Some(user.id.as_str()),
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
    Path(alter_id): Path<String>,
) -> Result<Json<Vec<UserAlterRelationship>>, AppError> {
    // Check if user has permission to view this alter
    // For now, allow any authenticated user to view relationships
    // TODO: Add proper permission checks

    let relationships = db.list_user_alter_relationships_by_alter(&alter_id).await?;

    debug!(user_id=%user.id, alter_id=%alter_id, count=%relationships.len(), "listed user-alter relationships");

    Ok(Json(relationships))
}

pub async fn replace_relationships(
    State(db): State<Db>,
    Extension(user): Extension<CurrentUser>,
    Path(alter_id): Path<String>,
    Json(payload): Json<ReplaceRelationshipsPayload>,
) -> Result<Json<super::RowsAffectedResponse>, AppError> {
    let alter = db
        .fetch_alter(&alter_id)
        .await
        .map_err(|_| AppError::Internal)?
        .ok_or(AppError::NotFound)?;

    if user.is_admin == 0 {
        let owner = alter.owner_user_id.clone().unwrap_or(user.id.clone());
        if owner != user.id {
            return Err(AppError::Forbidden);
        }
    }

    let mut requested: Vec<(String, &'static str)> = Vec::new();
    let mut seen_pairs: HashSet<(String, &'static str)> = HashSet::new();

    for user_id in payload.partners {
        if user_id.is_empty() {
            continue;
        }
        if seen_pairs.insert((user_id.clone(), "partner")) {
            requested.push((user_id, "partner"));
        }
    }

    for user_id in payload.parents {
        if user_id.is_empty() {
            continue;
        }
        if seen_pairs.insert((user_id.clone(), "parent")) {
            requested.push((user_id, "parent"));
        }
    }

    for user_id in payload.children {
        if user_id.is_empty() {
            continue;
        }
        if seen_pairs.insert((user_id.clone(), "child")) {
            requested.push((user_id, "child"));
        }
    }

    let mut user_cache: HashMap<String, bool> = HashMap::new();
    let mut new_relationships: Vec<NewUserAlterRelationship> = Vec::with_capacity(requested.len());

    for (user_id, relationship_type) in requested {
        let is_system = if let Some(is_system) = user_cache.get(&user_id) {
            *is_system
        } else {
            let target_user = db
                .fetch_user_by_id(&user_id)
                .await
                .map_err(|_| AppError::Internal)?
                .ok_or_else(|| AppError::BadRequest(format!("User {} not found", user_id)))?;
            let is_system = target_user.is_system;
            user_cache.insert(user_id.clone(), is_system == 1);
            is_system == 1
        };

        if is_system {
            return Err(AppError::BadRequest(
                "Cannot create relationships with system users".to_string(),
            ));
        }

        new_relationships.push(NewUserAlterRelationship {
            user_id: user_id.clone(),
            alter_id: alter_id.clone(),
            relationship_type: relationship_type.to_string(),
        });
    }

    let (relationships, rows_affected) = db
        .replace_user_alter_relationships(&alter_id, &new_relationships)
        .await
        .map_err(|_| AppError::Internal)?;

    audit::record_with_metadata(
        &db,
        Some(user.id.as_str()),
        "user_alter_relationship.replace",
        Some("alter"),
        Some(&alter_id.to_string()),
        serde_json::json!({
            "partner_count": relationships.iter().filter(|rel| rel.relationship_type == "partner").count(),
            "parent_count": relationships.iter().filter(|rel| rel.relationship_type == "parent").count(),
            "child_count": relationships.iter().filter(|rel| rel.relationship_type == "child").count(),
            "rows_affected": rows_affected,
        }),
    )
    .await;

    info!(
        user_id=%user.id,
        alter_id=%alter_id,
        count=%relationships.len(),
        rows_affected=rows_affected,
        "replaced user-alter relationships",
    );

    // FIXME: Return type
    Ok(Json(super::RowsAffectedResponse { rows_affected: rows_affected.try_into().unwrap() }))
}
