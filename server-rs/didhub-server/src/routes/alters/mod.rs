use crate::routes::common::{normalize_image_list, normalize_string_list};
use axum::response::IntoResponse;
use axum::{
    extract::{Extension, Path, Query, State},
    Json,
};
pub use didhub_db::Alter;
use didhub_db::{
    alters::AlterOperations, audit, relationships::AlterRelationships,
    subsystems::SubsystemOperations, user_alter_relationships::UserAlterRelationshipOperations,
    users::UserOperations, Db,
};
use didhub_error::AppError;
use didhub_metrics::record_entity_operation;
use didhub_middleware::types::CurrentUser;
use sqlx::QueryBuilder;
use std::collections::HashMap;
use tracing::{debug, error, info, warn};

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
                    Some(Value::String(trimmed.to_string()))
                }
            }
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

fn strip_relationship_fields(body: &mut serde_json::Value) {
    if let Some(obj) = body.as_object_mut() {
        for key in [
            "partners",
            "parents",
            "children",
            "affiliations",
            "user_relationships",
        ] {
            if obj.remove(key).is_some() {
                warn!(field = key, "Relationship field dropped from alter payload");
            }
        }
    }
}

#[derive(serde::Deserialize)]
pub struct ListQuery {
    pub q: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
    pub fields: Option<String>,
    pub user_id: Option<String>,
}

#[derive(serde::Serialize)]
pub struct ListResponse<T> {
    pub items: Vec<T>,
    pub total: i64,
    pub limit: i64,
    pub offset: i64,
}

#[derive(serde::Deserialize)]
pub struct UpdateAlterDto {
    pub name: Option<String>,
    pub owner_user_id: Option<String>,
    #[serde(flatten)]
    pub rest: std::collections::HashMap<String, serde_json::Value>,
}

#[derive(serde::Deserialize)]
pub struct ReplaceAlterRelationshipsPayload {
    #[serde(default)]
    pub partners: Vec<String>,
    #[serde(default)]
    pub parents: Vec<String>,
    #[serde(default)]
    pub children: Vec<String>,
    #[serde(default)]
    pub affiliations: Vec<String>,
}

#[derive(serde::Serialize)]
pub struct RowsAffectedResponse {
    pub rows_affected: i64,
}

pub async fn list_alters(
    State(db): State<Db>,
    Extension(user): Extension<CurrentUser>,
    Query(q): Query<ListQuery>,
) -> Result<axum::response::Response, AppError> {
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

    // If caller requested only names via fields=names, return the lightweight names response.
    if let Some(fields) = q.fields.as_ref() {
        let wants_names = fields
            .split(',')
            .map(|s| s.trim())
            .any(|field| matches!(field, "names" | "name"));
        if wants_names {
            let limit = q.limit.unwrap_or(500).clamp(1, 2000);
            let offset = q.offset.unwrap_or(0).max(0);
            let rows = db
                .list_alters_scoped(q.q.clone(), limit, offset, &user, q.user_id.as_deref())
                .await
                .map_err(|_| AppError::Internal)?;

            if rows.is_empty() {
                return Ok(Json(Vec::<NamesItem>::new()).into_response());
            }

            let mut owner_ids: Vec<String> = Vec::new();
            for a in &rows {
                if let Some(id) = &a.owner_user_id {
                    owner_ids.push(id.clone());
                }
            }
            owner_ids.sort_unstable();
            owner_ids.dedup();

            let mut username_lookup: HashMap<String, String> = HashMap::new();
            if !owner_ids.is_empty() {
                let mut qb =
                    QueryBuilder::<sqlx::Any>::new("SELECT id, username FROM users WHERE id IN (");
                {
                    let mut separated = qb.separated(", ");
                    for owner_id in &owner_ids {
                        separated.push_bind(owner_id);
                    }
                }
                qb.push(")");

                match qb
                    .build_query_as::<(String, String)>()
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
                    user_id: a.owner_user_id.clone(),
                    username: a
                        .owner_user_id
                        .and_then(|owner| username_lookup.get(&owner).cloned()),
                });
            }
            return Ok(Json(items).into_response());
        }
    }

    let limit = q.limit.unwrap_or(50).clamp(1, 500);
    let offset = q.offset.unwrap_or(0).max(0);

    // For now: visibility rule - only admins/system users see all. Regular users see alters they own OR global (no owner) OR created by approved users.
    let rows = db
        .list_alters_scoped(q.q.clone(), limit, offset, &user, q.user_id.as_deref())
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
        .count_alters_scoped(q.q.clone(), &user, q.user_id.as_deref())
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

    if let Some(fields) = q.fields.as_ref() {
        let requested_relationships = fields
            .split(',')
            .map(|s| s.trim())
            .any(|field| matches!(field, "relationships" | "rels"));
        if requested_relationships {
            warn!("Relationships are no longer included in alter list responses");
        }
    }

    let returned_count = rows.len();
    if returned_count == 0 {
        info!(
            user_id = %user.id,
            result_count = 0,
            total_count = total,
            "Alter list request returned no rows"
        );
        return Ok(Json(ListResponse {
            items: Vec::<Alter>::new(),
            total,
            limit,
            offset,
        })
        .into_response());
    }

    info!(
        user_id = %user.id,
        result_count = returned_count,
        total_count = total,
        "Alter list completed successfully"
    );

    Ok(Json(ListResponse {
        items: rows,
        total,
        limit,
        offset,
    })
    .into_response())
}

/// Return the single subsystem id for an alter (or null)
pub async fn get_alter_subsystem(
    Extension(_user): Extension<CurrentUser>,
    Extension(db): Extension<Db>,
    Path(id): Path<String>,
) -> Result<Json<Option<String>>, AppError> {
    debug!(alter_id = %id, "Fetching subsystem for alter");
    let subs = db.get_subsystem_for_alter(&id).await.map_err(|e| {
        error!(alter_id = %id, error = %e, "DB error getting subsystem for alter");
        AppError::Internal
    })?;
    Ok(Json(subs))
}

#[derive(serde::Deserialize)]
pub struct SetAlterSubsystemPayload {
    /// New subsystem id, or null to remove membership
    pub subsystem_id: Option<String>,
}

/// Replace subsystem membership for an alter
pub async fn set_alter_subsystem(
    Extension(user): Extension<CurrentUser>,
    Extension(db): Extension<Db>,
    Path(id): Path<String>,
    Json(payload): Json<SetAlterSubsystemPayload>,
) -> Result<Json<Option<String>>, AppError> {
    debug!(alter_id = %id, user_id = %user.id, "Setting subsystem for alter");

    // fetch alter to check ownership
    let alt = db
        .fetch_alter(&id)
        .await
        .map_err(|e| {
            error!(alter_id = %id, error = %e, "Failed to fetch alter for permission check");
            AppError::Internal
        })?
        .ok_or(AppError::NotFound)?;

    // Permission: owner or admin
    if user.is_admin == 0 {
        if let Some(owner) = alt.owner_user_id.as_deref() {
            if owner != user.id {
                return Err(AppError::Forbidden);
            }
        } else {
            return Err(AppError::Forbidden);
        }
    }

    // If a subsystem id is provided, ensure the subsystem exists and the
    // subsystem owner matches the alter owner (owner equality requirement)
    if let Some(ref sid) = payload.subsystem_id {
        let subsystem = db.fetch_subsystem(sid).await.map_err(|e| {
            error!(subsystem_id = %sid, error = %e, "Failed to fetch subsystem for ownership check");
            AppError::Internal
        })?.ok_or(AppError::NotFound)?;

        // Enforce: alter owner must be the same as subsystem owner (both Option<String>)
        let alt_owner = alt.owner_user_id.as_deref();
        let subsystem_owner = subsystem.owner_user_id.as_deref();
        if alt_owner != subsystem_owner {
            error!(alter_id = %id, subsystem_id = %sid, "Alter owner does not match subsystem owner");
            return Err(AppError::Forbidden);
        }
    }

    // Perform set (None removes membership)
    db.set_subsystem_for_alter(&id, payload.subsystem_id.as_deref())
        .await
        .map_err(|e| {
            error!(alter_id = %id, error = %e, "Failed to set subsystem for alter");
            AppError::Internal
        })?;

    // Return the new membership
    let subs = db.get_subsystem_for_alter(&id).await.map_err(|e| {
        error!(alter_id = %id, error = %e, "DB error getting subsystem for alter after set");
        AppError::Internal
    })?;
    let ip_arc = didhub_middleware::client_ip::get_request_ip();
    let ip = ip_arc.as_ref().map(|s| s.as_str());
    audit::record_with_metadata(
        &db,
        Some(user.id.as_str()),
        "alter.subsystem.set",
        Some("alter"),
        Some(&id.to_string()),
        serde_json::json!({"subsystem_id": subs}),
        ip,
    )
    .await;

    Ok(Json(subs))
}

/// Remove subsystem membership for an alter (equivalent to setting subsystem_id to null)
/// @api response=json
pub async fn delete_alter_subsystem(
    Extension(user): Extension<CurrentUser>,
    Extension(db): Extension<Db>,
    Path(id): Path<String>,
) -> Result<impl IntoResponse, AppError> {
    debug!(alter_id = %id, user_id = %user.id, "Deleting subsystem for alter");

    // fetch alter to check ownership
    let alt = db
        .fetch_alter(&id)
        .await
        .map_err(|e| {
            error!(alter_id = %id, error = %e, "Failed to fetch alter for permission check");
            AppError::Internal
        })?
        .ok_or(AppError::NotFound)?;

    // Permission: owner or admin
    if user.is_admin == 0 {
        if let Some(owner) = alt.owner_user_id.as_deref() {
            if owner != user.id {
                return Err(AppError::Forbidden);
            }
        } else {
            return Err(AppError::Forbidden);
        }
    }

    // Perform removal
    db.set_subsystem_for_alter(&id, None).await.map_err(|e| {
        error!(alter_id = %id, error = %e, "Failed to remove subsystem for alter");
        AppError::Internal
    })?;

    let ip_arc = didhub_middleware::client_ip::get_request_ip();
    let ip = ip_arc.as_ref().map(|s| s.as_str());
    audit::record_with_metadata(
        &db,
        Some(user.id.as_str()),
        "alter.subsystem.set",
        Some("alter"),
        Some(&id.to_string()),
        serde_json::json!({"subsystem_id": serde_json::Value::Null}),
        ip,
    )
    .await;

    Ok(axum::http::StatusCode::NO_CONTENT)
}

#[derive(serde::Serialize)]
pub struct NamesItem {
    pub id: String,
    pub name: String,
    pub user_id: Option<String>,
    pub username: Option<String>,
}

pub async fn search_alters(
    State(db): State<Db>,
    Extension(user): Extension<CurrentUser>,
    Query(q): Query<ListQuery>,
) -> Result<Json<ListResponse<NamesItem>>, AppError> {
    let limit = q.limit.unwrap_or(50).clamp(1, 200);
    let rows = db
        .list_alters_scoped(q.q.clone(), limit, 0, &user, q.user_id.as_deref())
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

    let mut owner_ids: Vec<String> = Vec::new();
    for a in &rows {
        if let Some(id) = &a.owner_user_id {
            owner_ids.push(id.clone());
        }
    }
    owner_ids.sort_unstable();
    owner_ids.dedup();

    let mut username_lookup: HashMap<String, String> = HashMap::new();
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
            .build_query_as::<(String, String)>()
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
            user_id: a.owner_user_id.clone(),
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

/// @api body=json
/// @api response=json
#[derive(serde::Deserialize, serde::Serialize)]
pub struct CreateAlterDto {
    pub name: Option<String>,
    pub owner_user_id: Option<String>,
    #[serde(flatten)]
    pub extra: std::collections::HashMap<String, serde_json::Value>,
}

pub async fn create_alter(
    State(db): State<Db>,
    Extension(user): Extension<CurrentUser>,
    Json(dto): Json<CreateAlterDto>,
) -> Result<Json<Alter>, AppError> {
    // Convert DTO to serde_json::Value (object) for existing normalization and DB calls
    let mut body = match serde_json::to_value(&dto) {
        Ok(serde_json::Value::Object(mut obj)) => {
            // merge flattened extra into object (serde_json::to_value already includes extra)
            serde_json::Value::Object(obj)
        }
        Ok(v) => v,
        Err(_) => return Err(AppError::BadRequest("invalid payload".into())),
    };
    if body
        .get("name")
        .and_then(|v| v.as_str())
        .map(|s| s.trim().is_empty())
        .unwrap_or(true)
    {
        record_entity_operation("alter", "create", "failure");
        return Err(AppError::BadRequest("name is required".into()));
    }
    // Ownership rules: non-admin cannot create for another owner
    if let Some(explicit) = body.get("owner_user_id").and_then(|v| v.as_str()) {
        if user.is_admin == 0 && explicit != user.id {
            record_entity_operation("alter", "create", "failure");
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
    strip_relationship_fields(&mut body);

    let created = db
        .create_alter(&body)
        .await
        .map_err(|e| AppError::BadRequest(e.to_string()))?;
    // Apply remaining fields (if any) to the newly created alter
    let _updated = db
        .update_alter_fields(&created.id, &body)
        .await
        .map_err(|e| {
            tracing::error!(error=%e, "update_alter_fields failed during create");
            AppError::Internal
        })?;
    let ip_arc = didhub_middleware::client_ip::get_request_ip();
    let ip = ip_arc.as_ref().map(|s| s.as_str());
    audit::record_entity(
        &db,
        Some(user.id.as_str()),
        "alter.create",
        "alter",
        &created.id.to_string(),
        ip,
    )
    .await;
    record_entity_operation("alter", "create", "success");
    let alter = db
        .fetch_alter(&created.id)
        .await
        .map_err(|_| AppError::Internal)?
        .ok_or(AppError::NotFound)?;
    Ok(Json(alter))
}

pub async fn get_alter(
    State(db): State<Db>,
    Extension(user): Extension<CurrentUser>,
    Path(id): Path<String>,
) -> Result<Json<Alter>, AppError> {
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
        .fetch_alter(&id)
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

    if !(user.is_admin == 1 || user.is_system == 1) {
        match (user.is_approved == 1, &a.owner_user_id) {
            (true, Some(owner)) if *owner != user.id => {
                warn!(
                    user_id = %user.id,
                    alter_id = %id,
                    owner_id = %owner,
                    "Approved user attempted to access alter owned by another user"
                );
                return Err(AppError::Forbidden);
            }
            (true, None) => {} // approved user can see unowned
            (false, Some(owner)) if *owner != user.id => {
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
        owner_user_id = ?&a.owner_user_id,
        "Alter fetched and access authorized successfully"
    );

    info!(
        user_id = %user.id,
        alter_id = %a.id,
        alter_name = %a.name,
        "Alter retrieval completed successfully"
    );

    Ok(Json(a))
}

pub async fn replace_alter_relationships(
    State(db): State<Db>,
    Extension(user): Extension<CurrentUser>,
    Path(id): Path<String>,
    Json(payload): Json<ReplaceAlterRelationshipsPayload>,
) -> Result<Json<RowsAffectedResponse>, AppError> {
    let existing = db
        .fetch_alter(&id)
        .await
        .map_err(|_| AppError::Internal)?
        .ok_or(AppError::NotFound)?;

    if user.is_admin == 0 {
        let owner = existing.owner_user_id.unwrap_or(user.id.clone());
        if owner != user.id {
            return Err(AppError::Forbidden);
        }
    }

    let mut partners = payload
        .partners
        .into_iter()
        .filter(|partner| *partner != id)
        .collect::<Vec<_>>();
    partners.sort_unstable();
    partners.dedup();

    let mut parents = payload
        .parents
        .into_iter()
        .filter(|parent| *parent != id)
        .collect::<Vec<_>>();
    parents.sort_unstable();
    parents.dedup();

    let mut children = payload
        .children
        .into_iter()
        .filter(|child| *child != id)
        .collect::<Vec<_>>();
    children.sort_unstable();
    children.dedup();

    let mut affiliations = payload.affiliations;
    affiliations.sort_unstable();
    affiliations.dedup();

    let partner_rows = db
        .replace_partners(&id, &partners)
        .await
        .map_err(|_| AppError::Internal)?;
    let parent_rows = db
        .replace_parents(&id, &parents)
        .await
        .map_err(|_| AppError::Internal)?;
    let child_rows = db
        .replace_children(&id, &children)
        .await
        .map_err(|_| AppError::Internal)?;
    let affiliation_rows = db
        .replace_affiliations(&id, &affiliations)
        .await
        .map_err(|_| AppError::Internal)?;

    let rows_affected = partner_rows + parent_rows + child_rows + affiliation_rows;

    let ip_arc = didhub_middleware::client_ip::get_request_ip();
    let ip = ip_arc.as_ref().map(|s| s.as_str());
    audit::record_with_metadata(
        &db,
        Some(user.id.as_str()),
        "alter.relationships.replace",
        Some("alter"),
        Some(id.as_str()),
        serde_json::json!({
            "partners": partners,
            "parents": parents,
            "children": children,
            "affiliations": affiliations,
        }),
        ip,
    )
    .await;

    info!(
        user_id=%user.id,
        alter_id=%id,
        partner_count=%partners.len(),
        parent_count=%parents.len(),
        child_count=%children.len(),
        affiliation_count=%affiliations.len(),
        rows_affected=rows_affected,
        "replaced alter relationships",
    );

    // FIXME: Return type
    Ok(Json(RowsAffectedResponse {
        rows_affected: rows_affected.try_into().unwrap(),
    }))
}

pub async fn update_alter(
    State(db): State<Db>,
    Extension(user): Extension<CurrentUser>,
    Path(id): Path<String>,
    Json(payload): Json<UpdateAlterDto>,
) -> Result<Json<Alter>, AppError> {
    // Convert DTO rest map into serde_json::Value object for existing normalization
    let mut body = serde_json::Value::Object(serde_json::Map::new());
    if let Some(n) = payload.name {
        body["name"] = serde_json::Value::String(n);
    }
    if let Some(o) = payload.owner_user_id {
        body["owner_user_id"] = serde_json::Value::String(o);
    }
    if let serde_json::Value::Object(map) = &mut body {
        for (k, v) in payload.rest {
            map.insert(k, v);
        }
    }

    if body.as_object().map(|m| m.is_empty()).unwrap_or(true) {
        record_entity_operation("alter", "update", "failure");
        return Err(AppError::validation(["no update fields provided"]));
    }
    let existing = db
        .fetch_alter(&id)
        .await
        .map_err(|_| AppError::Internal)?
        .ok_or(AppError::NotFound)?;
    if user.is_admin == 0 {
        let owner = existing.owner_user_id.as_ref().unwrap_or(&user.id).clone();
        if owner != user.id {
            tracing::debug!(
                target = "didhub_server",
                user_id = user.id,
                owner_user_id = ?&existing.owner_user_id,
                msg = "update_alter forbidden: user is not owner nor admin"
            );
            record_entity_operation("alter", "update", "failure");
            return Err(AppError::Forbidden);
        }
    }
    // Non-admin cannot reassign ownership
    if user.is_admin == 0 {
        if let Some(obj) = body.as_object() {
            if obj.contains_key("owner_user_id") {
                record_entity_operation("alter", "update", "failure");
                return Err(AppError::Forbidden);
            }
        }
    }

    normalize_subsystem_field(&mut body);
    strip_relationship_fields(&mut body);
    // Support deleting a single image via the alter update endpoint by including
    // a `delete_image_url` string field in the JSON payload.
    if let Some(obj) = body.as_object_mut() {
        if let Some(del_val) = obj.remove("delete_image_url") {
            let url = del_val
                .as_str()
                .ok_or_else(|| AppError::BadRequest("delete_image_url must be a string".into()))?
                .trim()
                .to_string();
            if url.is_empty() {
                return Err(AppError::BadRequest(
                    "delete_image_url cannot be empty".into(),
                ));
            }

            // Get current images as normalized upload URLs
            let current_images: Vec<String> = normalize_image_list(existing.images.as_deref());
            if !current_images.contains(&url) {
                return Err(AppError::NotFound);
            }
            let updated_images: Vec<String> =
                current_images.into_iter().filter(|u| u != &url).collect();

            // Build minimal update payload to set the new images list
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

            let updated = db
                .update_alter_fields(&id, &serde_json::Value::Object(update_payload))
                .await
                .map_err(|_| AppError::Internal)?
                .ok_or(AppError::NotFound)?;

            // Log the deletion under the same audit event used previously
            let ip_arc = didhub_middleware::client_ip::get_request_ip();
            let ip = ip_arc.as_ref().map(|s| s.as_str());
            audit::record_with_metadata(
                &db,
                Some(user.id.as_str()),
                "alter.delete_image",
                Some("alter"),
                Some(&id.to_string()),
                serde_json::json!({ "url": url }),
                ip,
            )
            .await;

            return Ok(Json(updated));
        }
    }
    let updated = db
        .update_alter_fields(&id, &body)
        .await
        .map_err(|_| AppError::Internal)?
        .ok_or(AppError::NotFound)?;
    let ip_arc = didhub_middleware::client_ip::get_request_ip();
    let ip = ip_arc.as_ref().map(|s| s.as_str());
    audit::record_entity(
        &db,
        Some(user.id.as_str()),
        "alter.update",
        "alter",
        &id.to_string(),
        ip,
    )
    .await;
    record_entity_operation("alter", "update", "success");
    Ok(Json(updated))
}

/// @api response=none
pub async fn delete_alter(
    State(db): State<Db>,
    Extension(user): Extension<CurrentUser>,
    Path(id): Path<String>,
) -> Result<impl axum::response::IntoResponse, AppError> {
    if user.is_admin == 0 {
        let existing = db
            .fetch_alter(&id)
            .await
            .map_err(|_| AppError::Internal)?
            .ok_or(AppError::NotFound)?;
        if existing.owner_user_id.unwrap_or(user.id.clone()) != user.id {
            record_entity_operation("alter", "delete", "failure");
            return Err(AppError::Forbidden);
        }
    }
    let ok = db.delete_alter(&id).await.map_err(|_| AppError::Internal)?;
    if !ok {
        record_entity_operation("alter", "delete", "failure");
        return Err(AppError::NotFound);
    }
    let ip_arc = didhub_middleware::client_ip::get_request_ip();
    let ip = ip_arc.as_ref().map(|s| s.as_str());
    audit::record_entity(
        &db,
        Some(user.id.as_str()),
        "alter.delete",
        "alter",
        &id.to_string(),
        ip,
    )
    .await;
    record_entity_operation("alter", "delete", "success");
    Ok(axum::http::StatusCode::NO_CONTENT)
}

#[derive(serde::Serialize)]
pub struct FamilyTreeResponse {
    pub nodes: std::collections::HashMap<String, FlatFamilyTreeNode>,
    pub edges: FamilyTreeEdges,
    pub roots: Vec<NestedFamilyTreeNode>,
    pub owners: std::collections::HashMap<String, OwnerInfo>,
}

#[derive(serde::Serialize)]
pub struct FamilyTreeEdges {
    pub parent: Vec<(String, String)>,  // (parent_id, child_id)
    pub partner: Vec<(String, String)>, // (partner1_id, partner2_id)
}

#[derive(serde::Serialize, Clone)]
pub struct FamilyTreeNode {
    pub id: String,
    pub name: String,
    pub partners: Vec<String>,
    pub parents: Vec<String>,
    pub children: Vec<String>, // Keep as IDs for flat representation
    pub affiliations: Vec<String>,
    pub duplicated: bool,
}

#[derive(serde::Serialize, Clone)]
pub struct NestedFamilyTreeNode {
    pub id: String,
    pub name: String,
    pub partners: Vec<String>,
    pub parents: Vec<String>,
    pub children: Vec<NestedFamilyTreeNode>, // Nested for tree building
    pub affiliations: Vec<String>,
    pub duplicated: bool,
}

#[derive(serde::Serialize, Clone)]
pub struct FlatFamilyTreeNode {
    pub id: String,
    pub name: String,
    pub partners: Vec<String>,
    pub parents: Vec<String>,
    pub children: Vec<String>,
    pub age: Option<String>,
    pub system_roles: Vec<String>,
    pub owner_user_id: Option<String>,
    pub user_partners: Vec<String>,
    pub user_parents: Vec<String>,
    pub user_children: Vec<String>,
}

#[derive(serde::Serialize, Clone)]
pub struct OwnerInfo {
    pub id: String,
    pub username: String,
    pub is_system: i64,
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
        alter_data.insert(alter.id.clone(), alter.clone());

        // Get relationship data for this alter
        let (partners, parents, children, affiliations) = tokio::join!(
            db.partners_of(&alter.id),
            db.parents_of(&alter.id),
            db.children_of(&alter.id),
            db.affiliations_of(&alter.id)
        );

        let partners = partners.unwrap_or_default();
        let parents = parents.unwrap_or_default();
        let children = children.unwrap_or_default();
        let affiliations = affiliations.unwrap_or_default();

        // Create the flat node
        let node = FamilyTreeNode {
            id: alter.id.clone(),
            name: alter.name.clone(),
            partners: partners.clone(),
            parents: parents.clone(),
            children: children.clone(),
            affiliations: affiliations.clone(),
            duplicated: false,
        };
        nodes_map.insert(alter.id.clone(), node);

        // Add parent edges (parent_id, child_id)
        for parent_id in parents {
            parent_edges.push((parent_id, alter.id.clone()));
        }

        // Add partner edges (only add if current alter's ID is smaller to avoid duplicates)
        for partner_id in partners {
            if alter.id < partner_id {
                partner_edges.push((alter.id.clone(), partner_id));
            }
        }
    }

    // Build the tree structure
    let mut visited = std::collections::HashSet::new();
    let mut built_nodes = std::collections::HashMap::new();

    fn build_node(
        node_id: String,
        nodes_map: &std::collections::HashMap<String, FamilyTreeNode>,
        visited: &mut std::collections::HashSet<String>,
        built_nodes: &mut std::collections::HashMap<String, NestedFamilyTreeNode>,
    ) -> Option<NestedFamilyTreeNode> {
        if visited.contains(&node_id) {
            // Return a duplicated marker node
            return Some(NestedFamilyTreeNode {
                id: node_id.clone(),
                name: nodes_map.get(&node_id).unwrap().name.clone(),
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
        visited.insert(node_id.clone());

        let mut children = Vec::new();
        for child_id in &flat_node.children {
            if let Some(child_node) = build_node(child_id.clone(), nodes_map, visited, built_nodes)
            {
                children.push(child_node);
            }
        }

        let built_node = NestedFamilyTreeNode {
            id: flat_node.id.clone(),
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
        for child_id in &node.children {
            all_child_ids.insert(child_id.clone());
        }
    }

    let mut tree_roots = Vec::new();
    for (id, _) in &nodes_map {
        // A node is a root if it's not a child of any other node in the dataset
        if !all_child_ids.contains(id) {
            if let Some(tree_node) =
                build_node(id.clone(), &nodes_map, &mut visited, &mut built_nodes)
            {
                tree_roots.push(tree_node);
            }
        }
    }

    // Collect all unique user IDs from alters and user relationships
    let mut user_ids = std::collections::HashSet::new();
    for alter in &alters {
        if let Some(owner_id) = &alter.owner_user_id {
            user_ids.insert((*owner_id).clone());
        }
    }

    // Also collect user IDs from user relationships
    for alter in &alters {
        let relationships = db
            .list_user_alter_relationships_by_alter(&alter.id)
            .await
            .unwrap_or_default();
        for relationship in relationships {
            user_ids.insert(relationship.user_id);
        }
    }

    // Fetch user data for owners
    let mut owners_map = std::collections::HashMap::new();
    for user_id in user_ids {
        if let Ok(Some(user)) = db.fetch_user_by_id(&user_id).await {
            owners_map.insert(
                user.id.to_string(),
                OwnerInfo {
                    id: user.id.to_string(),
                    username: user.username.clone(),
                    is_system: user.is_system,
                },
            );
        }
    }

    // Collect all user relationships for the alters
    let mut user_relationships_map = std::collections::HashMap::new();
    for alter in &alters {
        let relationships = db
            .list_user_alter_relationships_by_alter(&alter.id)
            .await
            .unwrap_or_default();
        user_relationships_map.insert(alter.id.clone(), relationships);
    }

    let edges = FamilyTreeEdges {
        parent: parent_edges,
        partner: partner_edges,
    };

    // Convert nodes_map to the flat format expected by frontend
    let empty_relationships = Vec::new();
    let flat_nodes: std::collections::HashMap<String, FlatFamilyTreeNode> = nodes_map
        .into_iter()
        .map(|(id, node)| {
            let alter = alter_data.get(&id);
            let user_relationships = user_relationships_map
                .get(&id)
                .unwrap_or(&empty_relationships);
            let user_partners: Vec<String> = user_relationships
                .iter()
                .filter(|r| r.relationship_type == "partner")
                .map(|r| r.user_id.clone())
                .collect();
            let user_parents: Vec<String> = user_relationships
                .iter()
                .filter(|r| r.relationship_type == "parent")
                .map(|r| r.user_id.clone())
                .collect();
            let user_children: Vec<String> = user_relationships
                .iter()
                .filter(|r| r.relationship_type == "child")
                .map(|r| r.user_id.clone())
                .collect();

            let system_roles = alter
                .map(|a| normalize_string_list(a.system_roles.as_deref()))
                .unwrap_or_default();

            (
                id.to_string(),
                FlatFamilyTreeNode {
                    id: node.id,
                    name: node.name,
                    partners: node.partners,
                    parents: node.parents,
                    children: node.children,
                    age: alter.and_then(|a| a.age.clone()),
                    system_roles,
                    owner_user_id: alter.and_then(|a| a.owner_user_id.clone()),
                    user_partners,
                    user_parents,
                    user_children,
                },
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
