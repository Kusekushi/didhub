pub mod relationships;

use crate::routes::common::{normalize_image_list, normalize_string_list};
use axum::{
    extract::{Extension, Path, Query, State},
    Json,
};
use didhub_db::relationships::AlterRelationships;
use didhub_db::{
    alters::AlterOperations, audit, models::UserAlterRelationship,
    user_alter_relationships::UserAlterRelationshipOperations, users::UserOperations, Alter, Db,
};
use didhub_error::AppError;
use didhub_middleware::types::CurrentUser;
use serde::Deserialize;
use sqlx::QueryBuilder;
use std::collections::HashMap;
use tracing::{debug, error, info, warn};

#[derive(Deserialize)]
pub struct ListQuery {
    pub q: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
    pub fields: Option<String>,
    pub user_id: Option<i64>,
}

#[derive(serde::Serialize)]
pub struct ListResponse<T> {
    pub items: Vec<T>,
    pub total: i64,
    pub limit: i64,
    pub offset: i64,
}

#[derive(serde::Deserialize)]
pub struct CreateAlterPayload {
    pub name: Option<String>,
    pub owner_user_id: Option<i64>,
}

#[derive(serde::Deserialize)]
pub struct UpdateAlterPayload {
    #[serde(flatten)]
    pub rest: serde_json::Value,
}

#[derive(serde::Serialize)]
pub struct AlterOut {
    pub id: i64,
    pub name: String,
    pub description: Option<String>,
    pub age: Option<String>,
    pub gender: Option<String>,
    pub pronouns: Option<String>,
    pub birthday: Option<String>,
    pub sexuality: Option<String>,
    pub species: Option<String>,
    pub alter_type: Option<String>,
    pub job: Option<String>,
    pub weapon: Option<String>,
    pub triggers: Option<String>,
    pub metadata: Option<String>,
    #[serde(default)]
    pub soul_songs: Vec<String>,
    #[serde(default)]
    pub interests: Vec<String>,
    pub notes: Option<String>,
    #[serde(default)]
    pub images: Vec<String>,
    pub subsystem: Option<i64>,
    #[serde(default)]
    pub system_roles: Vec<String>,
    pub is_system_host: i64,
    pub is_dormant: i64,
    pub is_merged: i64,
    pub owner_user_id: Option<i64>,
    pub created_at: Option<String>,
    pub partners: Vec<i64>,
    pub parents: Vec<i64>,
    pub children: Vec<i64>,
    pub affiliations: Vec<i64>,
    pub user_relationships: Vec<UserAlterRelationship>,
}

async fn project_with_rel(db: &Db, a: Alter, include_rels: bool) -> AlterOut {
    let (partners, parents, children, affiliations, user_relationships) = if include_rels {
        tokio::join!(
            db.partners_of(a.id),
            db.parents_of(a.id),
            db.children_of(a.id),
            db.affiliations_of(a.id),
            db.list_user_alter_relationships_by_alter(a.id)
        )
    } else {
        // Skip expensive relationship queries when not needed
        (Ok(vec![]), Ok(vec![]), Ok(vec![]), Ok(vec![]), Ok(vec![]))
    };

    let soul_songs = normalize_string_list(a.soul_songs.as_deref());
    let interests = normalize_string_list(a.interests.as_deref());
    let images = normalize_image_list(a.images.as_deref());
    let system_roles = normalize_string_list(a.system_roles.as_deref());
    let subsystem = parse_optional_i64(a.subsystem.as_deref());

    AlterOut {
        id: a.id,
        name: a.name,
        description: a.description,
        age: a.age,
        gender: a.gender,
        pronouns: a.pronouns,
        birthday: a.birthday,
        sexuality: a.sexuality,
        species: a.species,
        alter_type: a.alter_type,
        job: a.job,
        weapon: a.weapon,
        triggers: a.triggers,
        metadata: a.metadata,
        soul_songs,
        interests,
        notes: a.notes,
        images,
        subsystem,
        system_roles,
        is_system_host: a.is_system_host,
        is_dormant: a.is_dormant,
        is_merged: a.is_merged,
        owner_user_id: a.owner_user_id,
        created_at: a.created_at,
        partners: partners.unwrap_or_default(),
        parents: parents.unwrap_or_default(),
        children: children.unwrap_or_default(),
        affiliations: affiliations.unwrap_or_default(),
        user_relationships: user_relationships.unwrap_or_default(),
    }
}

static EMPTY_RELS: (Vec<i64>, Vec<i64>, Vec<i64>, Vec<i64>) = (vec![], vec![], vec![], vec![]);

fn parse_optional_i64(raw: Option<&str>) -> Option<i64> {
    raw.and_then(|value| {
        let trimmed = value.trim();
        if trimmed.is_empty() {
            None
        } else {
            trimmed.parse::<i64>().ok()
        }
    })
}

fn normalize_subsystem_field(body: &mut serde_json::Value) {
    use serde_json::Value;

    let Some(obj) = body.as_object_mut() else {
        return;
    };

    if let Some(current) = obj.get("subsystem").cloned() {
        let replacement = match current {
            Value::Number(num) => num.as_i64().map(|id| Value::String(id.to_string())),
            Value::String(raw) => {
                let trimmed = raw.trim();
                if trimmed.is_empty() {
                    None
                } else if let Ok(id) = trimmed.parse::<i64>() {
                    Some(Value::String(id.to_string()))
                } else {
                    None
                }
            }
            Value::Null => None,
            _ => None,
        };

        match replacement {
            Some(v) => {
                obj.insert("subsystem".to_string(), v);
            }
            None => {
                obj.insert("subsystem".to_string(), Value::Null);
            }
        }
    }
}

fn project_with_rel_batch(a: Alter, rels: &(Vec<i64>, Vec<i64>, Vec<i64>, Vec<i64>)) -> AlterOut {
    let (partners, parents, children, affiliations) = rels;
    let soul_songs = normalize_string_list(a.soul_songs.as_deref());
    let interests = normalize_string_list(a.interests.as_deref());
    let images = normalize_image_list(a.images.as_deref());
    let system_roles = normalize_string_list(a.system_roles.as_deref());
    let subsystem = parse_optional_i64(a.subsystem.as_deref());

    AlterOut {
        id: a.id,
        name: a.name,
        description: a.description,
        age: a.age,
        gender: a.gender,
        pronouns: a.pronouns,
        birthday: a.birthday,
        sexuality: a.sexuality,
        species: a.species,
        alter_type: a.alter_type,
        job: a.job,
        weapon: a.weapon,
        triggers: a.triggers,
        metadata: a.metadata,
        soul_songs,
        interests,
        notes: a.notes,
        images,
        subsystem,
        system_roles,
        is_system_host: a.is_system_host,
        is_dormant: a.is_dormant,
        is_merged: a.is_merged,
        owner_user_id: a.owner_user_id,
        created_at: a.created_at,
        partners: partners.clone(),
        parents: parents.clone(),
        children: children.clone(),
        affiliations: affiliations.clone(),
        user_relationships: vec![],
    }
}

pub async fn list_alters(
    State(db): State<Db>,
    Extension(user): Extension<CurrentUser>,
    Query(q): Query<ListQuery>,
) -> Result<Json<ListResponse<AlterOut>>, AppError> {
    debug!(
        user_id = %user.id,
        username = %user.username,
        is_admin = %user.is_admin,
        query = ?q.q,
        limit = ?q.limit,
        offset = ?q.offset,
        fields = ?q.fields,
        requested_user_id = ?q.user_id,
        "Starting alter list request"
    );

    // Allow filtering by any user_id when explicitly requested
    // The database layer will handle appropriate scoping

    let limit = q.limit.unwrap_or(50).clamp(1, 500);
    let offset = q.offset.unwrap_or(0).max(0);

    // For now: visibility rule - only admins/system users see all. Regular users see alters they own OR global (no owner) OR created by approved users.
    let rows = db
        .list_alters_scoped(q.q.clone(), limit, offset, &user, q.user_id)
        .await
        .map_err(|e| {
            error!(
                user_id = %user.id,
                error = %e,
                query = ?q.q,
                limit = limit,
                offset = offset,
                "Failed to list alters from database"
            );
            AppError::Internal
        })?;

    let total = db
        .count_alters_scoped(q.q.clone(), &user, q.user_id)
        .await
        .map_err(|e| {
            error!(
                user_id = %user.id,
                error = %e,
                query = ?q.q,
                "Failed to count alters"
            );
            AppError::Internal
        })?;

    let wanted: Option<std::collections::HashSet<String>> = q.fields.as_ref().map(|f| {
        f.split(',')
            .filter(|s| !s.is_empty())
            .map(|s| s.trim().to_string())
            .collect()
    });

    let include_rels = wanted
        .as_ref()
        .map(|w| w.contains("relationships") || w.contains("rels"))
        .unwrap_or(true);

    debug!(
        user_id = %user.id,
        returned_count = rows.len(),
        total_count = total,
        include_relationships = include_rels,
        "Alter list query completed, processing results"
    );

    if rows.is_empty() {
        info!(
            user_id = %user.id,
            result_count = 0,
            total_count = total,
            "Alter list request returned no rows"
        );
        return Ok(Json(ListResponse {
            items: Vec::new(),
            total,
            limit,
            offset,
        }));
    }

    if let Some(_w) = wanted {
        // For now only handle simple projection (relationships toggle)
        if include_rels {
            let alter_ids: Vec<i64> = rows.iter().map(|a| a.id).collect();
            let relationships = db.batch_load_relationships(&alter_ids).await?;
            let capacity = rows.len();
            let mut out = Vec::with_capacity(capacity);
            for a in rows.into_iter() {
                let rels = relationships.get(&a.id).unwrap_or(&EMPTY_RELS);
                out.push(project_with_rel_batch(a, rels));
            }
            info!(
                user_id = %user.id,
                result_count = out.len(),
                total_count = total,
                "Alter list with field filtering completed successfully"
            );
            return Ok(Json(ListResponse {
                items: out,
                total,
                limit,
                offset,
            }));
        } else {
            let capacity = rows.len();
            let mut out = Vec::with_capacity(capacity);
            for a in rows.into_iter() {
                out.push(project_with_rel(&db, a, false).await);
            }
            info!(
                user_id = %user.id,
                result_count = out.len(),
                total_count = total,
                "Alter list with field filtering completed successfully"
            );
            return Ok(Json(ListResponse {
                items: out,
                total,
                limit,
                offset,
            }));
        }
    }

    if include_rels {
        let alter_ids: Vec<i64> = rows.iter().map(|a| a.id).collect();
        let relationships = db
            .batch_load_relationships(&alter_ids)
            .await
            .map_err(|_| AppError::Internal)?;
        let mut out = Vec::with_capacity(rows.len());
        for a in rows {
            let rels = relationships.get(&a.id).unwrap_or(&EMPTY_RELS);
            out.push(project_with_rel_batch(a, rels));
        }
        info!(
            user_id = %user.id,
            result_count = out.len(),
            total_count = total,
            "Alter list completed successfully"
        );
        Ok(Json(ListResponse {
            items: out,
            total,
            limit,
            offset,
        }))
    } else {
        let mut out = Vec::with_capacity(rows.len());
        for a in rows {
            out.push(project_with_rel(&db, a, false).await);
        }
        info!(
            user_id = %user.id,
            result_count = out.len(),
            total_count = total,
            "Alter list completed successfully"
        );
        Ok(Json(ListResponse {
            items: out,
            total,
            limit,
            offset,
        }))
    }
}

#[derive(serde::Serialize)]
pub struct NamesItem {
    pub id: i64,
    pub name: String,
    pub user_id: Option<i64>,
    pub username: Option<String>,
}

pub async fn list_alter_names(
    State(db): State<Db>,
    Extension(user): Extension<CurrentUser>,
    Query(q): Query<ListQuery>,
) -> Result<Json<Vec<NamesItem>>, AppError> {
    let limit = q.limit.unwrap_or(500).clamp(1, 2000);
    let offset = q.offset.unwrap_or(0).max(0);
    let rows = db
        .list_alters_scoped(q.q.clone(), limit, offset, &user, q.user_id)
        .await
        .map_err(|_| AppError::Internal)?;

    if rows.is_empty() {
        return Ok(Json(Vec::new()));
    }

    let mut owner_ids: Vec<i64> = Vec::new();
    for a in &rows {
        if let Some(id) = a.owner_user_id {
            owner_ids.push(id);
        }
    }
    owner_ids.sort_unstable();
    owner_ids.dedup();

    let mut username_lookup: HashMap<i64, String> = HashMap::new();
    if !owner_ids.is_empty() {
        let mut qb = QueryBuilder::<sqlx::Any>::new("SELECT id, username FROM users WHERE id IN (");
        {
            let mut separated = qb.separated(", ");
            for owner_id in &owner_ids {
                separated.push_bind(owner_id);
            }
        }
        qb.push(")");

        match qb
            .build_query_as::<(i64, String)>()
            .fetch_all(&db.pool)
            .await
        {
            Ok(rows) => {
                for (id, username) in rows {
                    username_lookup.insert(id, username);
                }
            }
            Err(err) => {
                warn!(error = %err, "Failed to load usernames for alter names response");
            }
        }
    }

    let mut items = Vec::with_capacity(rows.len());
    for a in rows {
        items.push(NamesItem {
            id: a.id,
            name: a.name,
            user_id: a.owner_user_id,
            username: a
                .owner_user_id
                .and_then(|owner| username_lookup.get(&owner).cloned()),
        });
    }
    Ok(Json(items))
}

pub async fn search_alters(
    State(db): State<Db>,
    Extension(user): Extension<CurrentUser>,
    Query(q): Query<ListQuery>,
) -> Result<Json<ListResponse<NamesItem>>, AppError> {
    let limit = q.limit.unwrap_or(50).clamp(1, 200);
    let rows = db
        .list_alters_scoped(q.q.clone(), limit, 0, &user, q.user_id)
        .await
        .map_err(|_| AppError::Internal)?;

    if rows.is_empty() {
        return Ok(Json(ListResponse {
            items: Vec::new(),
            total: 0,
            limit,
            offset: 0,
        }));
    }

    let mut owner_ids: Vec<i64> = Vec::new();
    for a in &rows {
        if let Some(id) = a.owner_user_id {
            owner_ids.push(id);
        }
    }
    owner_ids.sort_unstable();
    owner_ids.dedup();

    let mut username_lookup: HashMap<i64, String> = HashMap::new();
    if !owner_ids.is_empty() {
        let mut qb = QueryBuilder::<sqlx::Any>::new("SELECT id, username FROM users WHERE id IN (");
        {
            let mut separated = qb.separated(", ");
            for owner_id in &owner_ids {
                separated.push_bind(owner_id);
            }
        }
        qb.push(")");

        match qb
            .build_query_as::<(i64, String)>()
            .fetch_all(&db.pool)
            .await
        {
            Ok(rows) => {
                for (id, username) in rows {
                    username_lookup.insert(id, username);
                }
            }
            Err(err) => {
                warn!(error = %err, "Failed to load usernames for alter search response");
            }
        }
    }

    let mut items: Vec<NamesItem> = Vec::with_capacity(rows.len());
    for a in rows {
        items.push(NamesItem {
            id: a.id,
            name: a.name,
            user_id: a.owner_user_id,
            username: a
                .owner_user_id
                .and_then(|owner| username_lookup.get(&owner).cloned()),
        });
    }
    let total_items = items.len() as i64;
    Ok(Json(ListResponse {
        items,
        total: total_items,
        limit,
        offset: 0,
    }))
}

pub async fn create_alter(
    State(db): State<Db>,
    Extension(user): Extension<CurrentUser>,
    Json(mut body): Json<serde_json::Value>,
) -> Result<Json<AlterOut>, AppError> {
    if body
        .get("name")
        .and_then(|v| v.as_str())
        .map(|s| s.trim().is_empty())
        .unwrap_or(true)
    {
        return Err(AppError::BadRequest("name is required".into()));
    }
    // Ownership rules: non-admin cannot create for another owner
    if let Some(explicit) = body.get("owner_user_id").and_then(|v| v.as_i64()) {
        if !user.is_admin && explicit != user.id {
            return Err(AppError::Forbidden);
        }
        body["owner_user_id"] = serde_json::json!(explicit);
    } else {
        body["owner_user_id"] = serde_json::json!(user.id);
    }
    // Ensure name is trimmed string
    if let Some(n) = body.get("name").and_then(|v| v.as_str()) {
        body["name"] = serde_json::json!(n.trim());
    }

    normalize_subsystem_field(&mut body);

    // Create the minimal record (DB create reads name + owner_user_id), then persist other fields via update_alter_fields
    // Extract relationship arrays (if present) so we can apply them after create
    let mut rel_partners: Option<Vec<i64>> = None;
    let mut rel_parents: Option<Vec<i64>> = None;
    let mut rel_children: Option<Vec<i64>> = None;
    let mut rel_affiliations: Option<Vec<i64>> = None;
    if let Some(obj) = body.as_object() {
        for (k, target) in [
            ("partners", &mut rel_partners),
            ("parents", &mut rel_parents),
            ("children", &mut rel_children),
            ("affiliations", &mut rel_affiliations),
        ] {
            if let Some(v) = obj.get(k) {
                if let Some(arr) = v.as_array() {
                    *target = Some(arr.iter().filter_map(|x| x.as_i64()).collect());
                }
            }
        }
    }

    let created = db
        .create_alter(&body)
        .await
        .map_err(|e| AppError::BadRequest(e.to_string()))?;
    // Apply remaining fields (if any) to the newly created alter
    let _updated = db
        .update_alter_fields(created.id, &body)
        .await
        .map_err(|e| {
            tracing::error!(error=%e, "update_alter_fields failed during create");
            AppError::Internal
        })?;
    // Apply relationship arrays after the record exists
    if let Some(p) = rel_partners {
        db.replace_partners(created.id, &p).await.map_err(|e| {
            tracing::error!(error=%e, "replace_partners failed during create");
            AppError::Internal
        })?;
    }
    if let Some(p) = rel_parents {
        db.replace_parents(created.id, &p).await.map_err(|e| {
            tracing::error!(error=%e, "replace_parents failed during create");
            AppError::Internal
        })?;
    }
    if let Some(c) = rel_children {
        db.replace_children(created.id, &c).await.map_err(|e| {
            tracing::error!(error=%e, "replace_children failed during create");
            AppError::Internal
        })?;
    }
    if let Some(a) = rel_affiliations {
        db.replace_affiliations(created.id, &a).await.map_err(|e| {
            tracing::error!(error=%e, "replace_affiliations failed during create");
            AppError::Internal
        })?;
    }
    audit::record_entity(
        &db,
        Some(user.id),
        "alter.create",
        "alter",
        &created.id.to_string(),
    )
    .await;
    let out = project_with_rel(
        &db,
        db.fetch_alter(created.id)
            .await
            .map_err(|_| AppError::Internal)?
            .ok_or(AppError::NotFound)?,
        true,
    )
    .await;
    Ok(Json(out))
}

pub async fn get_alter(
    State(db): State<Db>,
    Extension(user): Extension<CurrentUser>,
    Path(id): Path<i64>,
) -> Result<Json<AlterOut>, AppError> {
    debug!(
        user_id = %user.id,
        username = %user.username,
        is_admin = %user.is_admin,
        is_system = %user.is_system,
        is_approved = %user.is_approved,
        alter_id = %id,
        "Fetching alter by ID"
    );

    let a = db
        .fetch_alter(id)
        .await
        .map_err(|e| {
            error!(
                user_id = %user.id,
                alter_id = %id,
                error = %e,
                "Failed to fetch alter from database"
            );
            AppError::Internal
        })?
        .ok_or_else(|| {
            warn!(
                user_id = %user.id,
                alter_id = %id,
                "Alter not found"
            );
            AppError::NotFound
        })?;

    if !(user.is_admin || user.is_system) {
        match (user.is_approved, a.owner_user_id) {
            (true, Some(owner)) if owner != user.id => {
                warn!(
                    user_id = %user.id,
                    alter_id = %id,
                    owner_id = %owner,
                    "Approved user attempted to access alter owned by another user"
                );
                return Err(AppError::Forbidden);
            }
            (true, None) => {} // approved user can see unowned
            (false, Some(owner)) if owner != user.id => {
                warn!(
                    user_id = %user.id,
                    alter_id = %id,
                    owner_id = %owner,
                    "Unapproved user attempted to access alter owned by another user"
                );
                return Err(AppError::Forbidden);
            }
            (false, None) => {
                warn!(
                    user_id = %user.id,
                    alter_id = %id,
                    "Unapproved user attempted to access unowned alter"
                );
                return Err(AppError::Forbidden);
            }
            _ => {}
        }
    }

    debug!(
        user_id = %user.id,
        alter_id = %a.id,
        alter_name = %a.name,
        owner_user_id = ?a.owner_user_id,
        "Alter fetched and access authorized successfully"
    );

    let out = project_with_rel(&db, a, true).await;

    info!(
        user_id = %user.id,
        alter_id = %out.id,
        alter_name = %out.name,
        "Alter retrieval completed successfully"
    );

    Ok(Json(out))
}

pub async fn update_alter(
    State(db): State<Db>,
    Extension(user): Extension<CurrentUser>,
    Path(id): Path<i64>,
    Json(payload): Json<UpdateAlterPayload>,
) -> Result<Json<AlterOut>, AppError> {
    let UpdateAlterPayload { rest } = payload;
    let mut body = rest;

    if body.as_object().map(|m| m.is_empty()).unwrap_or(true) {
        return Err(AppError::validation(["no update fields provided"]));
    }
    let existing = db
        .fetch_alter(id)
        .await
        .map_err(|_| AppError::Internal)?
        .ok_or(AppError::NotFound)?;
    if !user.is_admin {
        let owner = existing.owner_user_id.unwrap_or(user.id);
        if owner != user.id {
            tracing::debug!(
                target = "didhub_server",
                user_id = user.id,
                owner_user_id = existing.owner_user_id,
                msg = "update_alter forbidden: user is not owner nor admin"
            );
            return Err(AppError::Forbidden);
        }
    }
    // Non-admin cannot reassign ownership
    if !user.is_admin {
        if let Some(obj) = body.as_object() {
            if obj.contains_key("owner_user_id") {
                return Err(AppError::Forbidden);
            }
        }
    }

    normalize_subsystem_field(&mut body);
    // Extract relationship arrays before generic update
    let mut rel_partners: Option<Vec<i64>> = None;
    let mut rel_parents: Option<Vec<i64>> = None;
    let mut rel_children: Option<Vec<i64>> = None;
    let mut rel_affiliations: Option<Vec<i64>> = None;
    if let Some(obj) = body.as_object() {
        for (k, target) in [
            ("partners", &mut rel_partners),
            ("parents", &mut rel_parents),
            ("children", &mut rel_children),
            ("affiliations", &mut rel_affiliations),
        ] {
            if let Some(v) = obj.get(k) {
                if let Some(arr) = v.as_array() {
                    *target = Some(arr.iter().filter_map(|x| x.as_i64()).collect());
                }
            }
        }
    }
    let updated = db
        .update_alter_fields(id, &body)
        .await
        .map_err(|_| AppError::Internal)?
        .ok_or(AppError::NotFound)?;
    if let Some(p) = rel_partners {
        db.replace_partners(id, &p)
            .await
            .map_err(|_| AppError::Internal)?;
    }
    if let Some(p) = rel_parents {
        db.replace_parents(id, &p)
            .await
            .map_err(|_| AppError::Internal)?;
    }
    if let Some(c) = rel_children {
        db.replace_children(id, &c)
            .await
            .map_err(|_| AppError::Internal)?;
    }
    if let Some(a) = rel_affiliations {
        db.replace_affiliations(id, &a)
            .await
            .map_err(|_| AppError::Internal)?;
    }
    audit::record_entity(&db, Some(user.id), "alter.update", "alter", &id.to_string()).await;
    let out = project_with_rel(&db, updated, true).await;
    Ok(Json(out))
}

pub async fn delete_alter(
    State(db): State<Db>,
    Extension(user): Extension<CurrentUser>,
    Path(id): Path<i64>,
) -> Result<impl axum::response::IntoResponse, AppError> {
    if !user.is_admin {
        let existing = db
            .fetch_alter(id)
            .await
            .map_err(|_| AppError::Internal)?
            .ok_or(AppError::NotFound)?;
        if existing.owner_user_id.unwrap_or(user.id) != user.id {
            return Err(AppError::Forbidden);
        }
    }
    let ok = db.delete_alter(id).await.map_err(|_| AppError::Internal)?;
    if !ok {
        return Err(AppError::NotFound);
    }
    audit::record_entity(&db, Some(user.id), "alter.delete", "alter", &id.to_string()).await;
    Ok(axum::http::StatusCode::NO_CONTENT)
}

#[derive(serde::Serialize)]
pub struct FamilyTreeResponse {
    pub nodes: std::collections::HashMap<String, serde_json::Value>,
    pub edges: FamilyTreeEdges,
    pub roots: Vec<NestedFamilyTreeNode>,
    pub owners: std::collections::HashMap<String, serde_json::Value>,
}

#[derive(serde::Serialize)]
pub struct FamilyTreeEdges {
    pub parent: Vec<(i64, i64)>,  // (parent_id, child_id)
    pub partner: Vec<(i64, i64)>, // (partner1_id, partner2_id)
}

#[derive(serde::Serialize, Clone)]
pub struct FamilyTreeNode {
    pub id: i64,
    pub name: String,
    pub partners: Vec<i64>,
    pub parents: Vec<i64>,
    pub children: Vec<i64>, // Keep as IDs for flat representation
    pub affiliations: Vec<i64>,
    pub duplicated: bool,
}

#[derive(serde::Serialize, Clone)]
pub struct NestedFamilyTreeNode {
    pub id: i64,
    pub name: String,
    pub partners: Vec<i64>,
    pub parents: Vec<i64>,
    pub children: Vec<NestedFamilyTreeNode>, // Nested for tree building
    pub affiliations: Vec<i64>,
    pub duplicated: bool,
}

pub async fn family_tree(
    State(db): State<Db>,
    Extension(user): Extension<CurrentUser>,
) -> Result<Json<FamilyTreeResponse>, AppError> {
    // Get all alters that the user has access to (following same visibility rules as list_alters)
    let alters = db
        .list_alters_scoped(None, 10000, 0, &user, None)
        .await
        .map_err(|_| AppError::Internal)?;

    let mut nodes_map = std::collections::HashMap::new();
    let mut alter_data = std::collections::HashMap::new();
    let mut parent_edges = Vec::new();
    let mut partner_edges = Vec::new();

    // Build flat nodes first
    for alter in &alters {
        // Store alter data for later use
        alter_data.insert(alter.id, alter.clone());

        // Get relationship data for this alter
        let (partners, parents, children, affiliations) = tokio::join!(
            db.partners_of(alter.id),
            db.parents_of(alter.id),
            db.children_of(alter.id),
            db.affiliations_of(alter.id)
        );

        let partners = partners.unwrap_or_default();
        let parents = parents.unwrap_or_default();
        let children = children.unwrap_or_default();
        let affiliations = affiliations.unwrap_or_default();

        // Create the flat node
        let node = FamilyTreeNode {
            id: alter.id,
            name: alter.name.clone(),
            partners: partners.clone(),
            parents: parents.clone(),
            children: children.clone(),
            affiliations: affiliations.clone(),
            duplicated: false,
        };
        nodes_map.insert(alter.id, node);

        // Add parent edges (parent_id, child_id)
        for parent_id in parents {
            parent_edges.push((parent_id, alter.id));
        }

        // Add partner edges (only add if current alter's ID is smaller to avoid duplicates)
        for partner_id in partners {
            if alter.id < partner_id {
                partner_edges.push((alter.id, partner_id));
            }
        }
    }

    // Build the tree structure
    let mut visited = std::collections::HashSet::new();
    let mut built_nodes = std::collections::HashMap::new();

    fn build_node(
        node_id: i64,
        nodes_map: &std::collections::HashMap<i64, FamilyTreeNode>,
        visited: &mut std::collections::HashSet<i64>,
        built_nodes: &mut std::collections::HashMap<i64, NestedFamilyTreeNode>,
    ) -> Option<NestedFamilyTreeNode> {
        if visited.contains(&node_id) {
            // Return a duplicated marker node
            return Some(NestedFamilyTreeNode {
                id: node_id,
                name: nodes_map.get(&node_id)?.name.clone(),
                partners: Vec::new(),
                parents: Vec::new(),
                children: Vec::new(),
                affiliations: Vec::new(),
                duplicated: true,
            });
        }

        if let Some(built) = built_nodes.get(&node_id) {
            return Some(built.clone());
        }

        let flat_node = nodes_map.get(&node_id)?;
        visited.insert(node_id);

        let mut children = Vec::new();
        for child_id in &flat_node.children {
            if let Some(child_node) = build_node(*child_id, nodes_map, visited, built_nodes) {
                children.push(child_node);
            }
        }

        let built_node = NestedFamilyTreeNode {
            id: flat_node.id,
            name: flat_node.name.clone(),
            partners: flat_node.partners.clone(),
            parents: flat_node.parents.clone(),
            children,
            affiliations: flat_node.affiliations.clone(),
            duplicated: false,
        };

        built_nodes.insert(node_id, built_node.clone());
        Some(built_node)
    }

    // Build tree for root nodes
    // First, collect all child IDs
    let mut all_child_ids = std::collections::HashSet::new();
    for node in nodes_map.values() {
        for &child_id in &node.children {
            all_child_ids.insert(child_id);
        }
    }

    let mut tree_roots = Vec::new();
    for (id, _) in &nodes_map {
        // A node is a root if it's not a child of any other node in the dataset
        if !all_child_ids.contains(id) {
            if let Some(tree_node) = build_node(*id, &nodes_map, &mut visited, &mut built_nodes) {
                tree_roots.push(tree_node);
            }
        }
    }

    // Collect all unique user IDs from alters and user relationships
    let mut user_ids = std::collections::HashSet::new();
    for alter in &alters {
        if let Some(owner_id) = alter.owner_user_id {
            user_ids.insert(owner_id);
        }
    }

    // Also collect user IDs from user relationships
    for alter in &alters {
        let relationships = db
            .list_user_alter_relationships_by_alter(alter.id)
            .await
            .unwrap_or_default();
        for relationship in relationships {
            user_ids.insert(relationship.user_id);
        }
    }

    // Fetch user data for owners
    let mut owners_map = std::collections::HashMap::new();
    for user_id in user_ids {
        if let Ok(Some(user)) = db.fetch_user_by_id(user_id).await {
            owners_map.insert(
                user.id.to_string(),
                serde_json::json!({
                    "id": user.id,
                    "username": user.username,
                    "is_system": user.is_system
                }),
            );
        }
    }

    // Collect all user relationships for the alters
    let mut user_relationships_map = std::collections::HashMap::new();
    for alter in &alters {
        let relationships = db
            .list_user_alter_relationships_by_alter(alter.id)
            .await
            .unwrap_or_default();
        user_relationships_map.insert(alter.id, relationships);
    }

    let edges = FamilyTreeEdges {
        parent: parent_edges,
        partner: partner_edges,
    };

    // Convert nodes_map to the flat format expected by frontend
    let empty_relationships = Vec::new();
    let flat_nodes = nodes_map
        .into_iter()
        .map(|(id, node)| {
            let alter = alter_data.get(&id);
            let user_relationships = user_relationships_map
                .get(&id)
                .unwrap_or(&empty_relationships);
            let user_partners: Vec<i64> = user_relationships
                .iter()
                .filter(|r| r.relationship_type == "partner")
                .map(|r| r.user_id)
                .collect();
            let user_parents: Vec<i64> = user_relationships
                .iter()
                .filter(|r| r.relationship_type == "parent")
                .map(|r| r.user_id)
                .collect();
            let user_children: Vec<i64> = user_relationships
                .iter()
                .filter(|r| r.relationship_type == "child")
                .map(|r| r.user_id)
                .collect();

            let system_roles = alter
                .map(|a| normalize_string_list(a.system_roles.as_deref()))
                .unwrap_or_default();

            (
                id.to_string(),
                serde_json::json!({
                    "id": node.id,
                    "name": node.name,
                    "partners": node.partners,
                    "parents": node.parents,
                    "children": node.children,
                    "age": alter.and_then(|a| a.age.clone()),
                    "system_roles": system_roles,
                    "owner_user_id": alter.and_then(|a| a.owner_user_id),
                    "user_partners": user_partners,
                    "user_parents": user_parents,
                    "user_children": user_children
                }),
            )
        })
        .collect();

    Ok(Json(FamilyTreeResponse {
        nodes: flat_nodes,
        edges,
        roots: tree_roots,
        owners: owners_map,
    }))
}

#[derive(serde::Deserialize)]
pub struct DeleteImagePayload {
    pub url: String,
}

pub async fn delete_alter_image(
    State(db): State<Db>,
    Extension(user): Extension<CurrentUser>,
    Path(id): Path<i64>,
    Json(payload): Json<DeleteImagePayload>,
) -> Result<Json<serde_json::Value>, AppError> {
    if payload.url.trim().is_empty() {
        return Err(AppError::BadRequest("URL is required".to_string()));
    }
    let existing = db
        .fetch_alter(id)
        .await
        .map_err(|_| AppError::Internal)?
        .ok_or(AppError::NotFound)?;
    if !user.is_admin {
        let owner = existing.owner_user_id.unwrap_or(user.id);
        if owner != user.id {
            tracing::debug!(
                target = "didhub_server",
                user_id = user.id,
                owner_user_id = existing.owner_user_id,
                msg = "delete_alter_image forbidden: user is not owner nor admin"
            );
            return Err(AppError::Forbidden);
        }
    }
    // Get current images as normalized upload URLs
    let current_images: Vec<String> = normalize_image_list(existing.images.as_deref());
    // Check if the URL exists
    if !current_images.contains(&payload.url) {
        return Err(AppError::NotFound);
    }
    // Remove the specified URL
    let updated_images: Vec<String> = current_images
        .into_iter()
        .filter(|u| u != &payload.url)
        .collect();
    // Update the alter
    let mut update_payload = serde_json::Map::new();
    update_payload.insert(
        "images".to_string(),
        serde_json::Value::Array(
            updated_images
                .into_iter()
                .map(serde_json::Value::String)
                .collect(),
        ),
    );
    let _updated = db
        .update_alter_fields(id, &serde_json::Value::Object(update_payload))
        .await
        .map_err(|_| AppError::Internal)?
        .ok_or(AppError::NotFound)?;
    // Log the deletion
    audit::record_with_metadata(
        &db,
        Some(user.id),
        "alter.delete_image",
        Some("alter"),
        Some(&id.to_string()),
        serde_json::json!({ "url": payload.url }),
    )
    .await;
    Ok(Json(serde_json::json!({ "success": true })))
}
