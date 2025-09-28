use didhub_db::audit;
use didhub_db::Db;
use didhub_error::AppError;
use didhub_db::subsystems::SubsystemOperations;
use didhub_middleware::types::CurrentUser;
use axum::{
    extract::{Extension, Path, Query},
    Json,
};
use serde::Deserialize;
use std::collections::HashMap;
use tracing::{debug, error, info, warn};
use crate::routes_common::{parse_leaders, check_subsystem_ownership, check_ownership_with_existing};

#[derive(Deserialize)]
pub struct ListQuery {
    pub q: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
    pub per_page: Option<i64>,
    pub owner_user_id: Option<i64>,
    pub fields: Option<String>,
}

#[derive(serde::Serialize)]
pub struct Paged<T> {
    pub items: Vec<T>,
    pub total: i64,
    pub limit: i64,
    pub offset: i64,
}

#[derive(serde::Serialize)]
pub struct SubsystemOut {
    pub id: i64,
    pub name: String,
    pub description: Option<String>,
    pub leaders: Vec<i64>,
    pub metadata: Option<String>,
    pub owner_user_id: Option<i64>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub alters: Vec<i64>,
}

fn project(s: didhub_db::Subsystem) -> SubsystemOut {
    let leaders: Vec<i64> = s
        .leaders
        .as_ref()
        .and_then(|v| serde_json::from_str::<Vec<i64>>(v).ok())
        .unwrap_or_default();
    SubsystemOut {
        id: s.id,
        name: s.name,
        description: s.description,
        leaders,
        metadata: s.metadata,
        owner_user_id: s.owner_user_id,
        alters: vec![],
    }
}

async fn batch_load_subsystem_members(db: &Db, subsystem_ids: &[i64]) -> Result<HashMap<i64, Vec<i64>>, AppError> {
    db.batch_load_subsystem_members(subsystem_ids).await.map_err(|_| AppError::Internal)
}

fn project_subsystem_with_members(s: didhub_db::Subsystem, members: &[i64]) -> SubsystemOut {
    let leaders: Vec<i64> = s
        .leaders
        .as_ref()
        .and_then(|v| serde_json::from_str::<Vec<i64>>(v).ok())
        .unwrap_or_default();
    SubsystemOut {
        id: s.id,
        name: s.name,
        description: s.description,
        leaders,
        metadata: s.metadata,
        owner_user_id: s.owner_user_id,
        alters: members.to_vec(),
    }
}

pub async fn list_subsystems(
    Extension(user): Extension<CurrentUser>,
    Extension(db): Extension<Db>,
    Query(q): Query<ListQuery>,
) -> Result<Json<Paged<SubsystemOut>>, AppError> {
    debug!(
        user_id = %user.id,
        query = ?q.q,
        limit = ?q.limit,
        offset = ?q.offset,
        per_page = ?q.per_page,
        owner_user_id = ?q.owner_user_id,
        fields = ?q.fields,
        "Listing subsystems"
    );

    // Support both 'limit' and 'per_page' parameters (per_page takes precedence)
    let limit = q.per_page.or(q.limit).unwrap_or(50).clamp(1, 200);
    let offset = q.offset.unwrap_or(0).max(0);

    // If no owner_user_id specified in query, default to current user unless admin
    let effective_owner_user_id = q.owner_user_id.or_else(|| {
        if user.is_admin {
            None
        } else {
            Some(user.id)
        }
    });

    let rows = db
        .list_subsystems(q.q.clone(), limit, offset, effective_owner_user_id)
        .await
        .map_err(|e| {
            error!(
                user_id = %user.id,
                error = %e,
                query = ?q.q,
                limit = limit,
                offset = offset,
                "Failed to list subsystems"
            );
            AppError::Internal
        })?;

    let total = db
        .count_subsystems(q.q.clone(), effective_owner_user_id)
        .await
        .map_err(|e| {
            error!(
                user_id = %user.id,
                error = %e,
                query = ?q.q,
                "Failed to count subsystems"
            );
            AppError::Internal
        })?;

    let wanted: Option<std::collections::HashSet<String>> = q.fields.as_ref().map(|f| {
        f.split(',')
            .filter(|s| !s.is_empty())
            .map(|s| s.trim().to_string())
            .collect()
    });

    let include_members = wanted
        .as_ref()
        .map(|w| w.contains("members") || w.contains("alters"))
        .unwrap_or(false);

    if include_members {
        let subsystem_ids: Vec<i64> = rows.iter().map(|s| s.id).collect();
        let members = batch_load_subsystem_members(&db, &subsystem_ids).await?;
        let items: Vec<SubsystemOut> = rows
            .into_iter()
            .map(|s| {
                let alters = members.get(&s.id).map(|v| v.as_slice()).unwrap_or(&[]);
                project_subsystem_with_members(s, alters)
            })
            .collect();
        debug!(
            user_id = %user.id,
            returned_count = items.len(),
            total_count = total,
            limit = limit,
            offset = offset,
            "Subsystem list with members completed successfully"
        );
        Ok(Json(Paged {
            items,
            total,
            limit,
            offset,
        }))
    } else {
        debug!(
            user_id = %user.id,
            returned_count = rows.len(),
            total_count = total,
            limit = limit,
            offset = offset,
            "Subsystem list completed successfully"
        );
        Ok(Json(Paged {
            items: rows.into_iter().map(project).collect(),
            total,
            limit,
            offset,
        }))
    }
}

#[derive(serde::Deserialize)]
pub struct CreateSubsystemPayload {
    pub name: String,
    pub description: Option<String>,
    pub leaders: Option<serde_json::Value>,
    pub metadata: Option<String>,
}

pub async fn create_subsystem(
    Extension(user): Extension<CurrentUser>,
    Extension(db): Extension<Db>,
    Json(payload): Json<CreateSubsystemPayload>,
) -> Result<(axum::http::StatusCode, Json<SubsystemOut>), AppError> {
    debug!(
        user_id = %user.id,
        username = %user.username,
        subsystem_name = %payload.name,
        has_description = payload.description.is_some(),
        has_leaders = payload.leaders.is_some(),
        has_metadata = payload.metadata.is_some(),
        "Creating new subsystem"
    );

    if payload.name.trim().is_empty() {
        warn!(
            user_id = %user.id,
            "Subsystem creation failed: empty name"
        );
        return Err(AppError::BadRequest("name required".into()));
    }

    let leaders_vec = payload
        .leaders
        .as_ref()
        .map(parse_leaders)
        .unwrap_or_default();

    debug!(
        user_id = %user.id,
        subsystem_name = %payload.name,
        leaders_count = leaders_vec.len(),
        "Parsed leaders for subsystem creation"
    );

    let created = db
        .create_subsystem(
            &payload.name,
            payload.description.as_deref(),
            &leaders_vec,
            payload.metadata.as_deref(),
            Some(user.id),
        )
        .await
        .map_err(|e| {
            error!(
                user_id = %user.id,
                subsystem_name = %payload.name,
                error = %e,
                "Failed to create subsystem in database"
            );
            AppError::Internal
        })?;

    debug!(
        user_id = %user.id,
        subsystem_id = %created.id,
        subsystem_name = %created.name,
        "Subsystem created successfully in database"
    );

    audit::record_entity(
        &db,
        Some(user.id),
        "subsystem.create",
        "subsystem",
        &created.id.to_string(),
    )
    .await;

    info!(
        user_id = %user.id,
        subsystem_id = %created.id,
        subsystem_name = %created.name,
        "Subsystem creation completed successfully"
    );

    Ok((axum::http::StatusCode::CREATED, Json(project(created))))
}

pub async fn get_subsystem(
    Extension(_user): Extension<CurrentUser>,
    Extension(db): Extension<Db>,
    Path(id): Path<i64>,
) -> Result<Json<SubsystemOut>, AppError> {
    debug!(
        user_id = %_user.id,
        subsystem_id = %id,
        "Fetching subsystem by ID"
    );

    let s = db
        .fetch_subsystem(id)
        .await
        .map_err(|e| {
            error!(
                user_id = %_user.id,
                subsystem_id = %id,
                error = %e,
                "Failed to fetch subsystem from database"
            );
            AppError::Internal
        })?
        .ok_or_else(|| {
            warn!(
                user_id = %_user.id,
                subsystem_id = %id,
                "Subsystem not found"
            );
            AppError::NotFound
        })?;

    debug!(
        user_id = %_user.id,
        subsystem_id = %s.id,
        subsystem_name = %s.name,
        owner_user_id = ?s.owner_user_id,
        "Subsystem fetched successfully"
    );

    Ok(Json(project(s)))
}

#[derive(serde::Deserialize)]
pub struct UpdateSubsystemPayload {
    #[serde(flatten)]
    pub rest: serde_json::Value,
}

pub async fn update_subsystem(
    Extension(user): Extension<CurrentUser>,
    Extension(db): Extension<Db>,
    Path(id): Path<i64>,
    Json(payload): Json<UpdateSubsystemPayload>,
) -> Result<Json<SubsystemOut>, AppError> {
    debug!(
        user_id = %user.id,
        username = %user.username,
        subsystem_id = %id,
        is_admin = %user.is_admin,
        update_payload = ?payload.rest,
        "Starting subsystem update"
    );

    if payload
        .rest
        .as_object()
        .map(|m| m.is_empty())
        .unwrap_or(true)
    {
        warn!(
            user_id = %user.id,
            subsystem_id = %id,
            "Subsystem update failed: no update fields provided"
        );
        return Err(AppError::BadRequest("no update fields".into()));
    }

    check_subsystem_ownership(&db, &user, id).await?;

    debug!(
        user_id = %user.id,
        subsystem_id = %id,
        "Permission check passed, proceeding with update"
    );

    let updated = db
        .update_subsystem(id, &payload.rest)
        .await
        .map_err(|e| {
            error!(
                user_id = %user.id,
                subsystem_id = %id,
                error = %e,
                "Failed to update subsystem in database"
            );
            AppError::Internal
        })?
        .ok_or_else(|| {
            warn!(
                user_id = %user.id,
                subsystem_id = %id,
                "Subsystem not found for update"
            );
            AppError::NotFound
        })?;

    debug!(
        user_id = %user.id,
        subsystem_id = %updated.id,
        subsystem_name = %updated.name,
        "Subsystem updated successfully in database"
    );

    audit::record_entity(
        &db,
        Some(user.id),
        "subsystem.update",
        "subsystem",
        &id.to_string(),
    )
    .await;

    info!(
        user_id = %user.id,
        subsystem_id = %updated.id,
        subsystem_name = %updated.name,
        "Subsystem update completed successfully"
    );

    Ok(Json(project(updated)))
}

pub async fn delete_subsystem(
    Extension(user): Extension<CurrentUser>,
    Extension(db): Extension<Db>,
    Path(id): Path<i64>,
) -> Result<axum::http::StatusCode, AppError> {
    debug!(
        user_id = %user.id,
        username = %user.username,
        subsystem_id = %id,
        is_admin = %user.is_admin,
        "Starting subsystem deletion"
    );

    check_subsystem_ownership(&db, &user, id).await?;

    debug!(
        user_id = %user.id,
        subsystem_id = %id,
        "Permission check passed, proceeding with deletion"
    );

    let ok = db
        .delete_subsystem(id)
        .await
        .map_err(|e| {
            error!(
                user_id = %user.id,
                subsystem_id = %id,
                error = %e,
                "Failed to delete subsystem from database"
            );
            AppError::Internal
        })?;

    if !ok {
        warn!(
            user_id = %user.id,
            subsystem_id = %id,
            "Subsystem deletion returned false (not found)"
        );
        return Err(AppError::NotFound);
    }

    audit::record_entity(
        &db,
        Some(user.id),
        "subsystem.delete",
        "subsystem",
        &id.to_string(),
    )
    .await;

    info!(
        user_id = %user.id,
        subsystem_id = %id,
        "Subsystem deletion completed successfully"
    );

    Ok(axum::http::StatusCode::NO_CONTENT)
}

#[derive(serde::Deserialize)]
pub struct ToggleLeaderPayload {
    pub alter_id: i64,
    pub add: Option<bool>,
}

pub async fn toggle_leader(
    Extension(user): Extension<CurrentUser>,
    Extension(db): Extension<Db>,
    Path(id): Path<i64>,
    Json(payload): Json<ToggleLeaderPayload>,
) -> Result<Json<SubsystemOut>, AppError> {
    debug!(
        user_id = %user.id,
        username = %user.username,
        subsystem_id = %id,
        alter_id = %payload.alter_id,
        add = ?payload.add,
        is_admin = %user.is_admin,
        "Starting leader toggle operation"
    );

    let existing = db
        .fetch_subsystem(id)
        .await
        .map_err(|e| {
            error!(
                user_id = %user.id,
                subsystem_id = %id,
                error = %e,
                "Failed to fetch subsystem for leader toggle"
            );
            AppError::Internal
        })?
        .ok_or_else(|| {
            warn!(
                user_id = %user.id,
                subsystem_id = %id,
                "Subsystem not found for leader toggle"
            );
            AppError::NotFound
        })?;

    check_ownership_with_existing(&user, existing.owner_user_id)?;

    debug!(
        user_id = %user.id,
        subsystem_id = %id,
        "Permission check passed, proceeding with leader toggle"
    );

    let mut leaders: Vec<i64> = existing
        .leaders
        .as_ref()
        .and_then(|s| serde_json::from_str::<Vec<i64>>(s).ok())
        .unwrap_or_default();

    let add = payload.add.unwrap_or(true);
    let was_present = leaders.contains(&payload.alter_id);

    if add {
        if !was_present {
            leaders.push(payload.alter_id);
            debug!(
                user_id = %user.id,
                subsystem_id = %id,
                alter_id = %payload.alter_id,
                "Adding alter as leader"
            );
        } else {
            debug!(
                user_id = %user.id,
                subsystem_id = %id,
                alter_id = %payload.alter_id,
                "Alter is already a leader, no change needed"
            );
        }
    } else {
        if was_present {
            leaders.retain(|x| *x != payload.alter_id);
            debug!(
                user_id = %user.id,
                subsystem_id = %id,
                alter_id = %payload.alter_id,
                "Removing alter from leaders"
            );
        } else {
            debug!(
                user_id = %user.id,
                subsystem_id = %id,
                alter_id = %payload.alter_id,
                "Alter is not a leader, no change needed"
            );
        }
    }

    let body = serde_json::json!({"leaders": leaders});
    let updated = db
        .update_subsystem(id, &body)
        .await
        .map_err(|e| {
            error!(
                user_id = %user.id,
                subsystem_id = %id,
                error = %e,
                "Failed to update subsystem leaders in database"
            );
            AppError::Internal
        })?
        .ok_or_else(|| {
            warn!(
                user_id = %user.id,
                subsystem_id = %id,
                "Subsystem not found after leader update"
            );
            AppError::NotFound
        })?;

    audit::record_entity(
        &db,
        Some(user.id),
        "subsystem.leaders.toggle",
        "subsystem",
        &id.to_string(),
    )
    .await;

    info!(
        user_id = %user.id,
        subsystem_id = %updated.id,
        alter_id = %payload.alter_id,
        action = if add { "added" } else { "removed" },
        "Subsystem leader toggle completed successfully"
    );

    Ok(Json(project(updated)))
}

#[derive(serde::Deserialize)]
pub struct MemberChangePayload {
    pub alter_id: i64,
    pub add: Option<bool>,
}

#[derive(serde::Serialize)]
pub struct MembersOut {
    pub subsystem_id: i64,
    pub alters: Vec<i64>,
}

pub async fn change_member(
    Extension(user): Extension<CurrentUser>,
    Extension(db): Extension<Db>,
    Path(id): Path<i64>,
    Json(payload): Json<MemberChangePayload>,
) -> Result<Json<MembersOut>, AppError> {
    debug!(
        user_id = %user.id,
        username = %user.username,
        subsystem_id = %id,
        alter_id = %payload.alter_id,
        add = ?payload.add,
        is_admin = %user.is_admin,
        "Starting member change operation"
    );

    let existing = db
        .fetch_subsystem(id)
        .await
        .map_err(|e| {
            error!(
                user_id = %user.id,
                subsystem_id = %id,
                error = %e,
                "Failed to fetch subsystem for member change"
            );
            AppError::Internal
        })?
        .ok_or_else(|| {
            warn!(
                user_id = %user.id,
                subsystem_id = %id,
                "Subsystem not found for member change"
            );
            AppError::NotFound
        })?;

    check_ownership_with_existing(&user, existing.owner_user_id)?;

    debug!(
        user_id = %user.id,
        subsystem_id = %id,
        "Permission check passed, proceeding with member change"
    );

    let add = payload.add.unwrap_or(true);
    if add {
        db.add_alter_to_subsystem(payload.alter_id, id)
            .await
            .map_err(|e| {
                error!(
                    user_id = %user.id,
                    subsystem_id = %id,
                    alter_id = %payload.alter_id,
                    error = %e,
                    "Failed to add alter to subsystem"
                );
                AppError::Internal
            })?;

        debug!(
            user_id = %user.id,
            subsystem_id = %id,
            alter_id = %payload.alter_id,
            "Alter added to subsystem successfully"
        );

        audit::record_with_metadata(
            &db,
            Some(user.id),
            "subsystem.member.add",
            Some("subsystem"),
            Some(&id.to_string()),
            serde_json::json!({"alter_id": payload.alter_id}),
        )
        .await;
    } else {
        db.remove_alter_from_subsystem(payload.alter_id, id)
            .await
            .map_err(|e| {
                error!(
                    user_id = %user.id,
                    subsystem_id = %id,
                    alter_id = %payload.alter_id,
                    error = %e,
                    "Failed to remove alter from subsystem"
                );
                AppError::Internal
            })?;

        debug!(
            user_id = %user.id,
            subsystem_id = %id,
            alter_id = %payload.alter_id,
            "Alter removed from subsystem successfully"
        );

        audit::record_with_metadata(
            &db,
            Some(user.id),
            "subsystem.member.remove",
            Some("subsystem"),
            Some(&id.to_string()),
            serde_json::json!({"alter_id": payload.alter_id}),
        )
        .await;
    }

    let members = db
        .list_alters_in_subsystem(id)
        .await
        .map_err(|e| {
            error!(
                user_id = %user.id,
                subsystem_id = %id,
                error = %e,
                "Failed to list alters in subsystem after member change"
            );
            AppError::Internal
        })?;

    info!(
        user_id = %user.id,
        subsystem_id = %id,
        alter_id = %payload.alter_id,
        action = if add { "added" } else { "removed" },
        total_members = members.len(),
        "Subsystem member change completed successfully"
    );

    Ok(Json(MembersOut {
        subsystem_id: id,
        alters: members,
    }))
}

pub async fn list_members(
    Extension(_user): Extension<CurrentUser>,
    Extension(db): Extension<Db>,
    Path(id): Path<i64>,
) -> Result<Json<MembersOut>, AppError> {
    debug!(
        user_id = %_user.id,
        subsystem_id = %id,
        "Listing subsystem members"
    );

    let members = db
        .list_alters_in_subsystem(id)
        .await
        .map_err(|e| {
            error!(
                user_id = %_user.id,
                subsystem_id = %id,
                error = %e,
                "Failed to list alters in subsystem"
            );
            AppError::Internal
        })?;

    debug!(
        user_id = %_user.id,
        subsystem_id = %id,
        member_count = members.len(),
        "Subsystem members listed successfully"
    );

    Ok(Json(MembersOut {
        subsystem_id: id,
        alters: members,
    }))
}
