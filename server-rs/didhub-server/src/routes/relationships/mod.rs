use axum::{extract::{Extension, State, Query}, Json};
use didhub_db::Db;
use didhub_db::models::PersonRelationship;
use didhub_db::relationships::PersonIdentifier;
use didhub_db::alters::AlterOperations;
use didhub_error::AppError;
use didhub_middleware::types::CurrentUser;
use serde::Deserialize;
use tracing::{info, debug};

#[derive(Deserialize)]
pub struct CreatePersonRelationshipPayload {
    /// Mixed id: "U:<uuid>" or "A:<uuid>"
    pub a: String,
    pub b: String,
    /// "spouse" or "parent"
    pub relationship_type: String,
    /// 0 or 1
    #[serde(default)]
    pub is_past_life: i32,
}

pub async fn create_relationship(
    State(db): State<Db>,
    Extension(user): Extension<CurrentUser>,
    Json(payload): Json<CreatePersonRelationshipPayload>,
) -> Result<Json<didhub_db::models::PersonRelationship>, AppError> {
    // Validate type
    if !["spouse", "parent"].contains(&payload.relationship_type.as_str()) {
        return Err(AppError::BadRequest("Invalid relationship type".to_string()));
    }

    // Permission enforcement: allow only admins, or owners of any Alter involved.
    let a_pid = PersonIdentifier::from_mixed_str(&payload.a);
    let b_pid = PersonIdentifier::from_mixed_str(&payload.b);

    // Permission logic:
    // - If either side is an Alter: allow if admin OR current user is owner of any involved Alter OR current user is the user participant.
    // - If both sides are Users: allow if admin OR current user is one of the user participants.
    let mut allowed = user.is_admin == 1;

    // If current user matches either user participant, allow
    if !allowed {
        if let PersonIdentifier::User(ref uid) = a_pid {
            if uid == &user.id { allowed = true; }
        }
        if !allowed {
            if let PersonIdentifier::User(ref uid) = b_pid {
                if uid == &user.id { allowed = true; }
            }
        }
    }

    // Otherwise, if either participant is an alter, check alter ownership
    if !allowed {
        if let PersonIdentifier::Alter(ref aid) = a_pid {
            if let Ok(Some(alt)) = db.fetch_alter(aid).await {
                if let Some(owner) = alt.owner_user_id { if owner == user.id { allowed = true; } }
            }
        }
    }
    if !allowed {
        if let PersonIdentifier::Alter(ref bid) = b_pid {
            if let Ok(Some(alt)) = db.fetch_alter(bid).await {
                if let Some(owner) = alt.owner_user_id { if owner == user.id { allowed = true; } }
            }
        }
    }

    if !allowed {
        return Err(AppError::Forbidden);
    }

    let id = uuid::Uuid::new_v4().to_string();
    db.insert_person_relationship_mixed(
        &id,
        &payload.relationship_type,
        &payload.a,
        &payload.b,
        payload.is_past_life,
        Some(&user.id),
    )
    .await
    .map_err(|_| AppError::Internal)?;

    // Fetch the inserted row for return (use relationships_for_mixed on one side and find the id)
    let rows = db.relationships_for_mixed(&payload.a).await.map_err(|_| AppError::Internal)?;
    for r in rows {
        if r.id == id {
            info!(user_id=%user.id, rel_id=%id, "created person relationship");
            return Ok(Json(r));
        }
    }

    // If not found, return a minimal PersonRelationship containing the id
    Ok(Json(PersonRelationship {
        id,
        r#type: payload.relationship_type,
        person_a_user_id: None,
        person_a_alter_id: None,
        person_b_user_id: None,
        person_b_alter_id: None,
        is_past_life: payload.is_past_life as i64,
        canonical_a: None,
        canonical_b: None,
        created_by_user_id: Some(user.id.clone()),
        created_at: None,
    }))
}

#[derive(Deserialize)]
pub struct ListQuery {
    pub id: String,
}

pub async fn list_for_entity(
    State(db): State<Db>,
    Extension(_user): Extension<CurrentUser>,
    Query(query): Query<ListQuery>,
) -> Result<Json<Vec<PersonRelationship>>, AppError> {
    let rows = db.relationships_for_mixed(&query.id).await.map_err(|_| AppError::Internal)?;
    debug!(count=%rows.len(), "listed person relationships");
    Ok(Json(rows))
}

pub async fn delete_relationship(
    State(db): State<Db>,
    Extension(user): Extension<CurrentUser>,
    axum::extract::Path(id): axum::extract::Path<String>,
) -> Result<axum::http::StatusCode, AppError> {
    // Fetch the relationship row so we can evaluate permissions
    let row = sqlx::query_as::<_, PersonRelationship>("SELECT * FROM person_relationships WHERE id = ?1")
        .bind(&id)
        .fetch_optional(&db.pool)
        .await
        .map_err(|_| AppError::Internal)?;

    let rel = row.ok_or(AppError::NotFound)?;

    // Build PersonIdentifier values for participants
    let mut participants: Vec<PersonIdentifier> = Vec::new();
    if let Some(u) = rel.person_a_user_id.as_deref() { participants.push(PersonIdentifier::User(u.to_string())); }
    if let Some(a) = rel.person_a_alter_id.as_deref() { participants.push(PersonIdentifier::Alter(a.to_string())); }
    if let Some(u) = rel.person_b_user_id.as_deref() { participants.push(PersonIdentifier::User(u.to_string())); }
    if let Some(a) = rel.person_b_alter_id.as_deref() { participants.push(PersonIdentifier::Alter(a.to_string())); }

    // Permission enforcement: admin or owner of any alter involved
    if user.is_admin == 0 {
        let mut allowed = false;
        for p in &participants {
            if let PersonIdentifier::Alter(aid) = p {
                if let Ok(Some(alt)) = db.fetch_alter(aid).await {
                    if let Some(owner) = alt.owner_user_id { if owner == user.id { allowed = true; break; } }
                }
            }
        }
        if !allowed {
            return Err(AppError::Forbidden);
        }
    }

    let deleted = db.delete_person_relationship(&id).await.map_err(|_| AppError::Internal)?;
    if deleted == 0 {
        return Err(AppError::NotFound);
    }
    info!(user_id=%user.id, rel_id=%id, "deleted person relationship");
    Ok(axum::http::StatusCode::NO_CONTENT)
}
