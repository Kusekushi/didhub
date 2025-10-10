use crate::routes::common::{check_group_ownership, check_ownership_with_existing, parse_leaders};
use axum::{
    extract::{Extension, Path, Query},
    Json,
};
use didhub_db::audit;
use didhub_db::groups::GroupOperations;
use didhub_db::relationships::AlterRelationships;
use didhub_db::Db;
use didhub_error::AppError;
use didhub_metrics::record_entity_operation;
use didhub_middleware::types::CurrentUser;
use serde::Deserialize;
use std::collections::HashMap;
use tracing::{debug, info, warn};

#[derive(Deserialize)]
pub struct GroupListQuery {
    pub q: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
    pub fields: Option<String>,
    pub owner_user_id: Option<String>,
}

#[derive(serde::Serialize)]
pub struct PagedGroups<T> {
    pub items: Vec<T>,
    pub total: i64,
    pub limit: i64,
    pub offset: i64,
}

#[derive(serde::Serialize)]
pub struct GroupOut {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub sigil: Option<String>,
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

fn project(g: didhub_db::Group) -> GroupOut {
    let leaders = deserialize_leader_ids(g.leaders.as_deref());
    GroupOut {
        id: g.id,
        name: g.name,
        description: g.description,
        sigil: g.sigil,
        leaders,
        metadata: g.metadata,
        owner_user_id: g.owner_user_id,
        alters: vec![],
    }
}

async fn batch_load_group_members(
    db: &Db,
    group_ids: &[&str],
) -> Result<HashMap<String, Vec<String>>, AppError> {
    db.batch_load_group_members(group_ids)
        .await
        .map_err(|_| AppError::Internal)
}

fn project_group_with_members(g: didhub_db::Group, members: &[String]) -> GroupOut {
    let leaders = deserialize_leader_ids(g.leaders.as_deref());
    GroupOut {
        id: g.id,
        name: g.name,
        description: g.description,
        sigil: g.sigil,
        leaders,
        metadata: g.metadata,
        owner_user_id: g.owner_user_id,
        alters: members.to_vec(),
    }
}

pub async fn list_groups(
    Extension(user): Extension<CurrentUser>,
    Extension(db): Extension<Db>,
    Query(q): Query<GroupListQuery>,
) -> Result<Json<PagedGroups<GroupOut>>, AppError> {
    let limit = q.limit.unwrap_or(50).clamp(1, 200);
    let offset = q.offset.unwrap_or(0).max(0);
    debug!(user_id=%user.id, query=?q.q, limit=%limit, offset=%offset, fields=?q.fields, owner_user_id=?q.owner_user_id, "listing groups");

    let (rows, total) = if let Some(owner_id) = q.owner_user_id.as_deref() {
        // Explicitly filtering by owner - allow any owner
        let rows = db
            .list_groups_by_owner(owner_id, q.q.clone(), limit, offset)
            .await
            .map_err(|_| AppError::Internal)?;
        let total = db
            .count_groups_by_owner(owner_id, q.q.clone())
            .await
            .map_err(|_| AppError::Internal)?;
        (rows, total)
    } else if q.q.is_some() {
        // Search query provided - show all matching groups
        let rows = db
            .list_groups(q.q.clone(), limit, offset)
            .await
            .map_err(|_| AppError::Internal)?;
        let total = db
            .count_groups(q.q.clone())
            .await
            .map_err(|_| AppError::Internal)?;
        (rows, total)
    } else if user.is_admin {
        // Admin with no filters - show all groups
        let rows = db
            .list_groups(None, limit, offset)
            .await
            .map_err(|_| AppError::Internal)?;
        let total = db
            .count_groups(None)
            .await
            .map_err(|_| AppError::Internal)?;
        (rows, total)
    } else {
        // Regular user with no filters - show only their own groups
        let rows = db
            .list_groups_by_owner(&user.id, None, limit, offset)
            .await
            .map_err(|_| AppError::Internal)?;
        let total = db
            .count_groups_by_owner(&user.id, None)
            .await
            .map_err(|_| AppError::Internal)?;
        (rows, total)
    };

    debug!(result_count=%rows.len(), total_count=%total, "groups listed");

    if rows.is_empty() {
        info!(total_count=%total, "Group list returned no results");
        return Ok(Json(PagedGroups {
            items: Vec::new(),
            total,
            limit,
            offset,
        }));
    }

    let row_count = rows.len();

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
        let mut group_ids = Vec::with_capacity(row_count);
        for g in &rows {
            group_ids.push(g.id.clone());
        }
        let group_id_refs: Vec<&str> = group_ids.iter().map(|s| s.as_str()).collect();
        let members = batch_load_group_members(&db, &group_id_refs).await?;
        let mut items = Vec::with_capacity(row_count);
        for g in rows {
            let alters = members.get(&g.id).map(|v| v.as_slice()).unwrap_or(&[]);
            items.push(project_group_with_members(g, alters));
        }
        debug!(result_count=%items.len(), "groups with members processed");
        Ok(Json(PagedGroups {
            items,
            total,
            limit,
            offset,
        }))
    } else {
        let mut items = Vec::with_capacity(row_count);
        for g in rows {
            items.push(project(g));
        }
        Ok(Json(PagedGroups {
            items,
            total,
            limit,
            offset,
        }))
    }
}

#[derive(serde::Deserialize)]
pub struct CreateGroupPayload {
    pub name: String,
    pub description: Option<String>,
    pub sigil: Option<String>,
    pub leaders: Option<serde_json::Value>,
    pub metadata: Option<String>,
    pub owner_user_id: Option<String>,
}

pub async fn create_group(
    Extension(user): Extension<CurrentUser>,
    Extension(db): Extension<Db>,
    Json(payload): Json<CreateGroupPayload>,
) -> Result<(axum::http::StatusCode, Json<GroupOut>), AppError> {
    if payload.name.trim().is_empty() {
        warn!(user_id=%user.id, "group creation failed - name required");
        return Err(AppError::BadRequest("name required".into()));
    }
    debug!(user_id=%user.id, group_name=%payload.name, "creating group");
    let leaders_vec = payload
        .leaders
        .as_ref()
        .map(parse_leaders)
        .unwrap_or_default();
    // Ownership rules: allow explicit owner_user_id when provided, but disallow non-admin users
    // from creating a group for another user.
    let owner: Option<&str> = if let Some(explicit) = payload.owner_user_id.as_deref() {
        if !user.is_admin && explicit != user.id {
            return Err(AppError::Forbidden);
        }
        Some(explicit)
    } else {
        // default owner is the creating user
        Some(&user.id)
    };

    let created = db
        .create_group(
            &payload.name,
            payload.description.as_deref(),
            payload.sigil.as_deref(),
            &leaders_vec,
            payload.metadata.as_deref(),
            owner,
        )
        .await
        .map_err(|_| AppError::Internal)?;
    info!(user_id=%user.id, group_id=%created.id, group_name=%created.name, "group created successfully");
    audit::record_entity(
        &db,
        Some(user.id.as_str()),
        "group.create",
        "group",
        &created.id.to_string(),
    )
    .await;
    record_entity_operation("group", "create", "success");
    Ok((axum::http::StatusCode::CREATED, Json(project(created))))
}

pub async fn get_group(
    Extension(_user): Extension<CurrentUser>,
    Extension(db): Extension<Db>,
    Path(id): Path<String>,
) -> Result<Json<GroupOut>, AppError> {
    debug!(group_id=%id, "fetching group");
    let g = db
        .fetch_group(&id)
        .await
        .map_err(|_| AppError::Internal)?
        .ok_or(AppError::NotFound)?;
    debug!(group_id=%id, group_name=%g.name, "group fetched successfully");
    Ok(Json(project(g)))
}

#[derive(serde::Deserialize)]
pub struct UpdateGroupPayload {
    #[serde(flatten)]
    pub rest: serde_json::Value,
}

pub async fn update_group(
    Extension(user): Extension<CurrentUser>,
    Extension(db): Extension<Db>,
    Path(id): Path<String>,
    Json(payload): Json<UpdateGroupPayload>,
) -> Result<Json<GroupOut>, AppError> {
    if payload
        .rest
        .as_object()
        .map(|m| m.is_empty())
        .unwrap_or(true)
    {
        warn!(user_id=%user.id, group_id=%id, "group update failed - no update fields provided");
        return Err(AppError::BadRequest("no update fields".into()));
    }
    let mut rest = payload.rest;
    debug!(user_id=%user.id, group_id=%id, update_fields=?rest, "updating group");
    check_group_ownership(&db, &user, &id).await?;
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
        .update_group(&id, &rest)
        .await
        .map_err(|_| AppError::Internal)?
        .ok_or(AppError::NotFound)?;
    info!(user_id=%user.id, group_id=%id, group_name=%updated.name, "group updated successfully");
    audit::record_entity(&db, Some(user.id.as_str()), "group.update", "group", &id.to_string()).await;
    record_entity_operation("group", "update", "success");
    Ok(Json(project(updated)))
}

pub async fn delete_group(
    Extension(user): Extension<CurrentUser>,
    Extension(db): Extension<Db>,
    Path(id): Path<String>,
) -> Result<axum::http::StatusCode, AppError> {
    debug!(user_id=%user.id, group_id=%id, "deleting group");
    check_group_ownership(&db, &user, &id).await?;
    let ok = db.delete_group(&id).await.map_err(|_| AppError::Internal)?;
    if !ok {
        warn!(user_id=%user.id, group_id=%id, "group deletion failed - group not found");
        return Err(AppError::NotFound);
    }
    info!(user_id=%user.id, group_id=%id, "group deleted successfully");
    audit::record_entity(&db, Some(user.id.as_str()), "group.delete", "group", &id.to_string()).await;
    record_entity_operation("group", "delete", "success");
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
) -> Result<Json<GroupOut>, AppError> {
    debug!(user_id=%user.id, group_id=%id, alter_id=%payload.alter_id, add=%payload.add.unwrap_or(true), "toggling group leader");
    let existing = db
        .fetch_group(&id)
        .await
        .map_err(|_| AppError::Internal)?
        .ok_or(AppError::NotFound)?;
    check_ownership_with_existing(&user, existing.owner_user_id)?;
    let mut leaders = deserialize_leader_ids(existing.leaders.as_deref());
    let add = payload.add.unwrap_or(true);
    if add {
        if !leaders.contains(&payload.alter_id) {
            leaders.push(payload.alter_id.clone());
        }
    } else {
        leaders.retain(|x| *x != payload.alter_id);
    }
    let body = serde_json::json!({"leaders": leaders});
    let updated = db
        .update_group(&id, &body)
        .await
        .map_err(|_| AppError::Internal)?
        .ok_or(AppError::NotFound)?;
    info!(user_id=%user.id, group_id=%id, alter_id=%payload.alter_id, action=%if payload.add.unwrap_or(true) { "added" } else { "removed" }, "group leader toggled successfully");
    audit::record_entity(
        &db,
        Some(user.id.as_str()),
        "group.leaders.toggle",
        "group",
        &id.to_string(),
    )
    .await;
    Ok(Json(project(updated)))
}

#[derive(serde::Serialize)]
pub struct GroupMembersOut {
    pub group_id: String,
    pub alters: Vec<String>,
}

pub async fn list_group_members(
    Extension(_user): Extension<CurrentUser>,
    Extension(db): Extension<Db>,
    Path(id): Path<String>,
) -> Result<Json<GroupMembersOut>, AppError> {
    debug!(group_id=%id, "listing group members");
    let members = db
        .list_alters_in_group(&id)
        .await
        .map_err(|_| AppError::Internal)?;
    debug!(group_id=%id, member_count=%members.len(), "group members listed");
    Ok(Json(GroupMembersOut {
        group_id: id,
        alters: members,
    }))
}
