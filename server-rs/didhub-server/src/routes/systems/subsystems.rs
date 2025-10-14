use crate::routes::common::{
    check_ownership_with_existing, check_subsystem_ownership, parse_leaders,
};
use axum::{
    extract::{Extension, Path, Query},
    Json,
};
use didhub_db::audit;
use didhub_db::subsystems::SubsystemOperations;
use didhub_db::Db;
use didhub_error::AppError;
use didhub_metrics::record_entity_operation;
use didhub_middleware::types::CurrentUser;
use serde::Deserialize;
use std::collections::HashMap;
use tracing::{debug, error, info, warn};

#[derive(Deserialize)]
pub struct ListQuery {
    pub q: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
    pub per_page: Option<i64>,
    pub owner_user_id: Option<String>,
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
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub leaders: Vec<String>,
    pub metadata: Option<String>,
    pub owner_user_id: Option<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub alters: Vec<String>,
}

fn deserialize_leader_ids(raw: Option<&str>) -> Vec<String> {
    match raw {
        Some(text) => serde_json::from_str::<serde_json::Value>(text)
            .map(|value| parse_leaders(&value))
            .unwrap_or_else(|_| parse_leaders(&serde_json::Value::String(text.to_string()))),
        None => Vec::new(),
    }
}

fn project(s: didhub_db::Subsystem) -> SubsystemOut {
    let leaders = deserialize_leader_ids(s.leaders.as_deref());
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

async fn batch_load_subsystem_members(
    db: &Db,
    subsystem_ids: &[String],
) -> Result<HashMap<String, Vec<String>>, AppError> {
    let ids: Vec<&str> = subsystem_ids.iter().map(|s| s.as_str()).collect();
    db.batch_load_subsystem_members(&ids)
        .await
        .map_err(|_| AppError::Internal)
}

fn project_subsystem_with_members(s: didhub_db::Subsystem, members: &[String]) -> SubsystemOut {
    let leaders = deserialize_leader_ids(s.leaders.as_deref());
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
    let effective_owner_user_id = q
        .owner_user_id
        .or_else(|| {
            if user.is_admin == 1 {
                None
            } else {
                Some(user.id.clone())
            }
        })
        .map(|id| id.to_string());

    let rows = db
        .list_subsystems(
            q.q.clone(),
            limit,
            offset,
            effective_owner_user_id.as_deref(),
        )
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
        .count_subsystems(q.q.clone(), effective_owner_user_id.as_deref())
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

    if rows.is_empty() {
        info!(
            user_id = %user.id,
            total_count = total,
            limit = limit,
            offset = offset,
            "Subsystem list returned no results"
        );
        return Ok(Json(Paged {
            items: Vec::new(),
            total,
            limit,
            offset,
        }));
    }

    let row_count = rows.len();

    if include_members {
        let mut subsystem_ids = Vec::with_capacity(row_count);
        for s in &rows {
            subsystem_ids.push(s.id.clone());
        }
        let members = batch_load_subsystem_members(&db, &subsystem_ids).await?;
        let mut items = Vec::with_capacity(row_count);
        for s in rows {
            let alters = members.get(&s.id).map(|v| v.as_slice()).unwrap_or(&[]);
            items.push(project_subsystem_with_members(s, alters));
        }
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
        let mut items = Vec::with_capacity(row_count);
        for subsystem in rows {
            items.push(project(subsystem));
        }
        Ok(Json(Paged {
            items,
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
    pub owner_user_id: Option<String>,
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

    // Ownership rules: allow explicit owner_user_id when provided, but disallow non-admin users
    // from creating a subsystem for another user.
    let owner: Option<String> = if let Some(explicit) = payload.owner_user_id {
        if user.is_admin == 0 && explicit != user.id {
            return Err(AppError::Forbidden);
        }
        Some(explicit)
    } else {
        Some(user.id.to_string())
    };

    let created = db
        .create_subsystem(
            &payload.name,
            payload.description.as_deref(),
            &leaders_vec,
            payload.metadata.as_deref(),
            owner.as_deref(),
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

    let ip_arc = didhub_middleware::client_ip::get_request_ip();
    let ip = ip_arc.as_ref().map(|s| s.as_str());
    audit::record_entity(
        &db,
        Some(user.id.as_str()),
        "subsystem.create",
        "subsystem",
        &created.id.to_string(),
        ip,
    )
    .await;

    info!(
        user_id = %user.id,
        subsystem_id = %created.id,
        subsystem_name = %created.name,
        "Subsystem creation completed successfully"
    );

    record_entity_operation("subsystem", "create", "success");

    Ok((axum::http::StatusCode::CREATED, Json(project(created))))
}

pub async fn get_subsystem(
    Extension(_user): Extension<CurrentUser>,
    Extension(db): Extension<Db>,
    Path(id): Path<String>,
) -> Result<Json<SubsystemOut>, AppError> {
    debug!(
        user_id = %_user.id,
        subsystem_id = %id,
        "Fetching subsystem by ID"
    );

    let s = db
        .fetch_subsystem(&id)
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
    Path(id): Path<String>,
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

    check_subsystem_ownership(&db, &user, &id).await?;

    debug!(
        user_id = %user.id,
        subsystem_id = %id,
        "Permission check passed, proceeding with update"
    );

    let mut rest = payload.rest;
    if let Some(obj) = rest.as_object_mut() {
        if let Some(raw) = obj.get("leaders").cloned() {
            let ids = parse_leaders(&raw);
            obj.insert(
                "leaders".to_string(),
                serde_json::Value::Array(ids.into_iter().map(serde_json::Value::from).collect()),
            );
        }
    }

    let updated = db
        .update_subsystem(&id, &rest)
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

    let ip_arc = didhub_middleware::client_ip::get_request_ip();
    let ip = ip_arc.as_ref().map(|s| s.as_str());
    audit::record_entity(
        &db,
        Some(user.id.as_str()),
        "subsystem.update",
        "subsystem",
        &id.to_string(),
        ip,
    )
    .await;

    info!(
        user_id = %user.id,
        subsystem_id = %updated.id,
        subsystem_name = %updated.name,
        "Subsystem update completed successfully"
    );

    record_entity_operation("subsystem", "update", "success");

    Ok(Json(project(updated)))
}

pub async fn delete_subsystem(
    Extension(user): Extension<CurrentUser>,
    Extension(db): Extension<Db>,
    Path(id): Path<String>,
) -> Result<axum::http::StatusCode, AppError> {
    debug!(
        user_id = %user.id,
        username = %user.username,
        subsystem_id = %id,
        is_admin = %user.is_admin,
        "Starting subsystem deletion"
    );

    check_subsystem_ownership(&db, &user, &id).await?;

    debug!(
        user_id = %user.id,
        subsystem_id = %id,
        "Permission check passed, proceeding with deletion"
    );

    let ok = db.delete_subsystem(&id).await.map_err(|e| {
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

    let ip_arc = didhub_middleware::client_ip::get_request_ip();
    let ip = ip_arc.as_ref().map(|s| s.as_str());
    audit::record_entity(
        &db,
        Some(user.id.as_str()),
        "subsystem.delete",
        "subsystem",
        &id.to_string(),
        ip,
    )
    .await;

    info!(
        user_id = %user.id,
        subsystem_id = %id,
        "Subsystem deletion completed successfully"
    );

    record_entity_operation("subsystem", "delete", "success");

    Ok(axum::http::StatusCode::NO_CONTENT)
}

#[derive(serde::Deserialize)]
pub struct ToggleLeaderPayload {
    pub alter_id: String,
    pub add: Option<bool>,
}

pub async fn toggle_leader(
    Extension(user): Extension<CurrentUser>,
    Extension(db): Extension<Db>,
    Path(id): Path<String>,
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
        .fetch_subsystem(&id)
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

    let mut leaders = deserialize_leader_ids(existing.leaders.as_deref());

    let add = payload.add.unwrap_or(true);
    let was_present = leaders.contains(&payload.alter_id);

    if add {
        if !was_present {
            leaders.push(payload.alter_id.clone());
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
        .update_subsystem(&id, &body)
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

    let ip_arc = didhub_middleware::client_ip::get_request_ip();
    let ip = ip_arc.as_ref().map(|s| s.as_str());
    audit::record_entity(
        &db,
        Some(user.id.as_str()),
        "subsystem.leaders.toggle",
        "subsystem",
        &id.to_string(),
        ip,
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
    pub alter_id: String,
    pub add: Option<bool>,
}

#[derive(serde::Serialize)]
pub struct MembersOut {
    pub subsystem_id: String,
    pub alters: Vec<String>,
}

pub async fn change_member(
    Extension(user): Extension<CurrentUser>,
    Extension(db): Extension<Db>,
    Path(id): Path<String>,
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
        .fetch_subsystem(&id)
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
        db.add_alter_to_subsystem(&payload.alter_id.to_string(), &id)
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

    let ip_arc = didhub_middleware::client_ip::get_request_ip();
    let ip = ip_arc.as_ref().map(|s| s.as_str());
        audit::record_with_metadata(
            &db,
            Some(user.id.as_str()),
            "subsystem.member.add",
            Some("subsystem"),
            Some(&id.to_string()),
            serde_json::json!({"alter_id": payload.alter_id}),
            ip,
        )
        .await;
    } else {
        db.remove_alter_from_subsystem(&payload.alter_id.to_string(), &id)
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

    let ip_arc = didhub_middleware::client_ip::get_request_ip();
    let ip = ip_arc.as_ref().map(|s| s.as_str());
        audit::record_with_metadata(
            &db,
            Some(user.id.as_str()),
            "subsystem.member.remove",
            Some("subsystem"),
            Some(&id.to_string()),
            serde_json::json!({"alter_id": payload.alter_id}),
            ip,
        )
        .await;
    }

    let members = db.list_alters_in_subsystem(&id).await.map_err(|e| {
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
    Path(id): Path<String>,
) -> Result<Json<MembersOut>, AppError> {
    debug!(
        user_id = %_user.id,
        subsystem_id = %id,
        "Listing subsystem members"
    );

    let members = db.list_alters_in_subsystem(&id).await.map_err(|e| {
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

/// Remove a member from a subsystem using DELETE /subsystems/{id}/members with payload { alter_id }
pub async fn delete_member(
    Extension(user): Extension<CurrentUser>,
    Extension(db): Extension<Db>,
    Path(id): Path<String>,
    Json(payload): Json<MemberChangePayload>,
) -> Result<Json<MembersOut>, AppError> {
    debug!(
        user_id = %user.id,
        subsystem_id = %id,
        alter_id = %payload.alter_id,
        "Deleting subsystem member"
    );

    let existing = db
        .fetch_subsystem(&id)
        .await
        .map_err(|e| {
            error!(
                user_id = %user.id,
                subsystem_id = %id,
                error = %e,
                "Failed to fetch subsystem for member deletion"
            );
            AppError::Internal
        })?
        .ok_or_else(|| {
            warn!(
                user_id = %user.id,
                subsystem_id = %id,
                "Subsystem not found for member deletion"
            );
            AppError::NotFound
        })?;

    check_ownership_with_existing(&user, existing.owner_user_id)?;

    debug!(
        user_id = %user.id,
        subsystem_id = %id,
        "Permission check passed, proceeding with member deletion"
    );

    db.remove_alter_from_subsystem(&payload.alter_id.to_string(), &id)
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

    let ip_arc = didhub_middleware::client_ip::get_request_ip();
    let ip = ip_arc.as_ref().map(|s| s.as_str());
    audit::record_with_metadata(
        &db,
        Some(user.id.as_str()),
        "subsystem.member.remove",
        Some("subsystem"),
        Some(&id.to_string()),
        serde_json::json!({"alter_id": payload.alter_id}),
        ip,
    )
    .await;

    let members = db.list_alters_in_subsystem(&id).await.map_err(|e| {
        error!(
            user_id = %user.id,
            subsystem_id = %id,
            error = %e,
            "Failed to list alters in subsystem after deletion"
        );
        AppError::Internal
    })?;

    info!(
        user_id = %user.id,
        subsystem_id = %id,
        alter_id = %payload.alter_id,
        total_members = members.len(),
        "Subsystem member deletion completed successfully"
    );

    Ok(Json(MembersOut {
        subsystem_id: id,
        alters: members,
    }))
}
