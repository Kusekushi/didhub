use crate::routes_common::{check_group_ownership, check_ownership_with_existing, parse_leaders};
use axum::{
    extract::{Extension, Path, Query},
    Json,
};
use didhub_db::audit;
use didhub_db::groups::GroupOperations;
use didhub_db::relationships::AlterRelationships;
use didhub_db::Db;
use didhub_error::AppError;
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
    pub owner_user_id: Option<i64>,
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
    pub id: i64,
    pub name: String,
    pub description: Option<String>,
    pub sigil: Option<String>,
    pub leaders: Vec<i64>,
    pub metadata: Option<String>,
    pub owner_user_id: Option<i64>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub alters: Vec<i64>,
}

fn project(g: didhub_db::Group) -> GroupOut {
    let leaders: Vec<i64> = g
        .leaders
        .as_ref()
        .and_then(|s| serde_json::from_str::<Vec<i64>>(s).ok())
        .unwrap_or_default();
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
    group_ids: &[i64],
) -> Result<HashMap<i64, Vec<i64>>, AppError> {
    db.batch_load_group_members(group_ids)
        .await
        .map_err(|_| AppError::Internal)
}

fn project_group_with_members(g: didhub_db::Group, members: &[i64]) -> GroupOut {
    let leaders: Vec<i64> = g
        .leaders
        .as_ref()
        .and_then(|s| serde_json::from_str::<Vec<i64>>(s).ok())
        .unwrap_or_default();
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

    let (rows, total) = if let Some(owner_id) = q.owner_user_id {
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
            .list_groups_by_owner(user.id, None, limit, offset)
            .await
            .map_err(|_| AppError::Internal)?;
        let total = db
            .count_groups_by_owner(user.id, None)
            .await
            .map_err(|_| AppError::Internal)?;
        (rows, total)
    };

    debug!(result_count=%rows.len(), total_count=%total, "groups listed");

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
        let group_ids: Vec<i64> = rows.iter().map(|g| g.id).collect();
        let members = batch_load_group_members(&db, &group_ids).await?;
        let items: Vec<GroupOut> = rows
            .into_iter()
            .map(|g| {
                let alters = members.get(&g.id).map(|v| v.as_slice()).unwrap_or(&[]);
                project_group_with_members(g, alters)
            })
            .collect();
        debug!(result_count=%items.len(), "groups with members processed");
        Ok(Json(PagedGroups {
            items,
            total,
            limit,
            offset,
        }))
    } else {
        let items = rows.into_iter().map(project).collect();
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
    let created = db
        .create_group(
            &payload.name,
            payload.description.as_deref(),
            payload.sigil.as_deref(),
            &leaders_vec,
            payload.metadata.as_deref(),
            Some(user.id),
        )
        .await
        .map_err(|_| AppError::Internal)?;
    info!(user_id=%user.id, group_id=%created.id, group_name=%created.name, "group created successfully");
    audit::record_entity(
        &db,
        Some(user.id),
        "group.create",
        "group",
        &created.id.to_string(),
    )
    .await;
    Ok((axum::http::StatusCode::CREATED, Json(project(created))))
}

pub async fn get_group(
    Extension(_user): Extension<CurrentUser>,
    Extension(db): Extension<Db>,
    Path(id): Path<i64>,
) -> Result<Json<GroupOut>, AppError> {
    debug!(group_id=%id, "fetching group");
    let g = db
        .fetch_group(id)
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
    Path(id): Path<i64>,
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
    debug!(user_id=%user.id, group_id=%id, update_fields=?payload.rest, "updating group");
    check_group_ownership(&db, &user, id).await?;
    let updated = db
        .update_group(id, &payload.rest)
        .await
        .map_err(|_| AppError::Internal)?
        .ok_or(AppError::NotFound)?;
    info!(user_id=%user.id, group_id=%id, group_name=%updated.name, "group updated successfully");
    audit::record_entity(&db, Some(user.id), "group.update", "group", &id.to_string()).await;
    Ok(Json(project(updated)))
}

pub async fn delete_group(
    Extension(user): Extension<CurrentUser>,
    Extension(db): Extension<Db>,
    Path(id): Path<i64>,
) -> Result<axum::http::StatusCode, AppError> {
    debug!(user_id=%user.id, group_id=%id, "deleting group");
    check_group_ownership(&db, &user, id).await?;
    let ok = db.delete_group(id).await.map_err(|_| AppError::Internal)?;
    if !ok {
        warn!(user_id=%user.id, group_id=%id, "group deletion failed - group not found");
        return Err(AppError::NotFound);
    }
    info!(user_id=%user.id, group_id=%id, "group deleted successfully");
    audit::record_entity(&db, Some(user.id), "group.delete", "group", &id.to_string()).await;
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
) -> Result<Json<GroupOut>, AppError> {
    debug!(user_id=%user.id, group_id=%id, alter_id=%payload.alter_id, add=%payload.add.unwrap_or(true), "toggling group leader");
    let existing = db
        .fetch_group(id)
        .await
        .map_err(|_| AppError::Internal)?
        .ok_or(AppError::NotFound)?;
    check_ownership_with_existing(&user, existing.owner_user_id)?;
    let mut leaders: Vec<i64> = existing
        .leaders
        .as_ref()
        .and_then(|s| serde_json::from_str::<Vec<i64>>(s).ok())
        .unwrap_or_default();
    let add = payload.add.unwrap_or(true);
    if add {
        if !leaders.contains(&payload.alter_id) {
            leaders.push(payload.alter_id);
        }
    } else {
        leaders.retain(|x| *x != payload.alter_id);
    }
    let body = serde_json::json!({"leaders": leaders});
    let updated = db
        .update_group(id, &body)
        .await
        .map_err(|_| AppError::Internal)?
        .ok_or(AppError::NotFound)?;
    info!(user_id=%user.id, group_id=%id, alter_id=%payload.alter_id, action=%if payload.add.unwrap_or(true) { "added" } else { "removed" }, "group leader toggled successfully");
    audit::record_entity(
        &db,
        Some(user.id),
        "group.leaders.toggle",
        "group",
        &id.to_string(),
    )
    .await;
    Ok(Json(project(updated)))
}

#[derive(serde::Serialize)]
pub struct GroupMembersOut {
    pub group_id: i64,
    pub alters: Vec<i64>,
}

pub async fn list_group_members(
    Extension(_user): Extension<CurrentUser>,
    Extension(db): Extension<Db>,
    Path(id): Path<i64>,
) -> Result<Json<GroupMembersOut>, AppError> {
    debug!(group_id=%id, "listing group members");
    let members = db
        .list_alters_in_group(id)
        .await
        .map_err(|_| AppError::Internal)?;
    debug!(group_id=%id, member_count=%members.len(), "group members listed");
    Ok(Json(GroupMembersOut {
        group_id: id,
        alters: members,
    }))
}
