use argon2::password_hash::{rand_core::OsRng, SaltString};
use argon2::{Argon2, PasswordHasher};
use axum::{
    extract::{Extension, Path, Query, State},
    Json,
};
use didhub_db::audit;
use didhub_db::users::UserOperations;
use didhub_db::{Db, NewUser, UpdateUserFields, User, UserListFilters};
use didhub_error::AppError;
use didhub_middleware::types::{AdminFlag, CurrentUser};
use serde::{Deserialize, Serialize};

#[derive(Deserialize, Debug)]
pub struct UsersQuery {
    pub page: Option<i64>,
    pub per_page: Option<i64>,
    pub q: Option<String>,
    // For names mode, support limit/offset like the old endpoint
    pub limit: Option<i64>,
    pub offset: Option<i64>,
    // keep as strings here and parse later to be permissive about 0/1 and true/false
    pub is_admin: Option<String>,
    pub is_system: Option<String>,
    pub is_approved: Option<String>,
    pub sort_by: Option<String>, // id|username|created_at
    pub order: Option<String>,   // asc|desc
    // when present and truthy, return a lightweight names-only list instead of full users
    pub names: Option<String>,
}

fn parse_flag(s: &Option<String>) -> Option<bool> {
    let s = s.as_ref()?.trim();
    if s.eq_ignore_ascii_case("true") || s == "1" {
        Some(true)
    } else if s.eq_ignore_ascii_case("false") || s == "0" {
        Some(false)
    } else {
        None
    }
}

#[derive(Serialize)]
pub struct UsersListResponseMeta {
    pub page: i64,
    pub per_page: i64,
    pub total: i64,
    pub pages: i64,
    pub next: Option<i64>,
    pub prev: Option<i64>,
}

#[derive(Serialize)]
pub struct UsersListResponse<T> {
    pub meta: UsersListResponseMeta,
    pub items: Vec<T>,
}

fn sanitize_user(mut user: User) -> User {
    user.password_hash = None;
    user
}

pub async fn list_users(
    State(db): State<Db>,
    Extension(current): Extension<CurrentUser>,
    Query(q): Query<UsersQuery>,
) -> Result<Json<serde_json::Value>, AppError> {
    if current.is_approved == 0 {
        return Err(AppError::Forbidden);
    }
    // If names flag is present and truthy, return lightweight names response
    let want_names = match q.names.as_deref() {
        Some(s) if s.eq_ignore_ascii_case("true") || s == "1" => true,
        _ => false,
    };
    let page = q.page.unwrap_or(1).max(1);
    let per_page = q.per_page.unwrap_or(50).clamp(1, 200);
    let sort_by = match q.sort_by.as_deref() {
        Some("username") => "username",
        Some("created_at") => "created_at",
        _ => "id",
    };
    let order_desc = match q.order.as_deref() {
        Some("asc") => false,
        _ => true,
    };
    if want_names {
        // names mode: use limit/offset semantics and fixed filters (exclude system users, only approved)
        let limit = q.limit.unwrap_or(500).clamp(1, 2000);
        let offset = q.offset.unwrap_or(0).max(0);
        let filters = UserListFilters {
            q: q.q.clone(),
            is_admin: None,
            is_system: Some(false),
            is_approved: Some(true),
            sort_by: "username".to_string(),
            order_desc: false,
            limit,
            offset,
        };
        let (rows, total) = db
            .list_users_advanced(&filters)
            .await
            .map_err(|_| AppError::Internal)?;
        let mut items = Vec::with_capacity(rows.len());
        for u in rows {
            items.push(NamesItem {
                id: u.id.clone(),
                name: u.username,
            });
        }
        let resp = serde_json::json!({
            "items": items,
            "total": total,
            "limit": limit,
            "offset": offset,
        });
        return Ok(Json(resp));
    }

    let offset = (page - 1) * per_page;
    let filters = UserListFilters {
        q: q.q.clone(),
        is_admin: parse_flag(&q.is_admin),
        is_system: parse_flag(&q.is_system),
        is_approved: parse_flag(&q.is_approved),
        sort_by: sort_by.to_string(),
        order_desc,
        limit: per_page,
        offset,
    };
    let (rows, total) = db
        .list_users_advanced(&filters)
        .await
        .map_err(|_| AppError::Internal)?;

    let items: Vec<User> = rows.into_iter().map(sanitize_user).collect();
    let pages = if total == 0 {
        1
    } else {
        (total + per_page - 1) / per_page
    };
    let next = if page < pages { Some(page + 1) } else { None };
    let prev = if page > 1 { Some(page - 1) } else { None };
    let meta = UsersListResponseMeta {
        page,
        per_page,
        total,
        pages,
        next,
        prev,
    };
    Ok(Json(
        serde_json::to_value(UsersListResponse { meta, items }).map_err(|_| AppError::Internal)?,
    ))
}

#[derive(serde::Deserialize)]
pub struct UpdateUserPayload {
    pub is_admin: Option<bool>,
    pub is_system: Option<bool>,
    pub is_approved: Option<bool>,
    pub must_change_password: Option<bool>,
    pub avatar: Option<Option<String>>, // Some(Some(val)) set, Some(None) clear, None ignore // FIXME - this is weird
}

pub async fn get_user(
    State(db): State<Db>,
    Extension(current): Extension<CurrentUser>,
    Path(id): Path<String>,
) -> Result<Json<User>, AppError> {
    if current.is_approved == 0 {
        return Err(AppError::Forbidden);
    }
    let u = db
        .fetch_user_by_id(&id)
        .await
        .map_err(|_| AppError::Internal)?
        .ok_or(AppError::NotFound)?;
    Ok(Json(sanitize_user(u)))
}

pub async fn update_user(
    State(db): State<Db>,
    _admin: Extension<AdminFlag>,
    Extension(actor): Extension<CurrentUser>,
    Path(id): Path<String>,
    Json(payload): Json<UpdateUserPayload>,
) -> Result<Json<User>, AppError> {
    let mut fields = UpdateUserFields::default();
    fields.is_admin = payload.is_admin;
    fields.is_system = payload.is_system;
    fields.is_approved = payload.is_approved;
    fields.must_change_password = payload.must_change_password;
    fields.avatar = payload.avatar;
    let u = db
        .update_user(&id, fields)
        .await
        .map_err(|_| AppError::Internal)?
        .ok_or(AppError::NotFound)?;
    audit::record_entity(
        &db,
        Some(actor.id.as_str()),
        "user.update",
        "user",
        &u.id.to_string(),
    )
    .await;
    Ok(Json(sanitize_user(u)))
}

#[derive(Deserialize)]
pub struct DeleteUserPayload {
    pub reassign_to: Option<String>,
}

pub async fn delete_user(
    State(db): State<Db>,
    _admin: Extension<AdminFlag>,
    Extension(actor): Extension<CurrentUser>,
    Path(id): Path<String>,
    maybe_payload: Option<Json<DeleteUserPayload>>,
) -> Result<Json<serde_json::Value>, AppError> {
    // Prevent self deletion for now (could be allowed with extra safeguards)
    if actor.id == id {
        return Err(AppError::Forbidden);
    }
    // Ensure target exists
    let existing = db
        .fetch_user_by_id(&id)
        .await
        .map_err(|_| AppError::Internal)?;
    if existing.is_none() {
        return Err(AppError::NotFound);
    }
    let payload = maybe_payload
        .map(|p| p.0)
        .unwrap_or(DeleteUserPayload { reassign_to: None });
    if let Some(ref to_id) = payload.reassign_to {
        if *to_id == id {
            return Err(AppError::BadRequest("Cannot reassign to same user".into()));
        }
        // ensure destination exists
        if db
            .fetch_user_by_id(&to_id)
            .await
            .map_err(|_| AppError::Internal)?
            .is_none()
        {
            return Err(AppError::BadRequest("Reassignment target not found".into()));
        }
        db.reassign_user_content(&id, &to_id)
            .await
            .map_err(|_| AppError::Internal)?;
    }
    let ok = db.delete_user(&id).await.map_err(|_| AppError::Internal)?;
    if !ok {
        return Err(AppError::NotFound);
    }
    audit::record_entity(&db, Some(actor.id.as_str()), "user.delete", "user", &id).await;
    Ok(Json(
        serde_json::json!({"deleted": true, "reassigned_to": payload.reassign_to }),
    ))
}

#[derive(serde::Deserialize)]
pub struct CreateUserPayload {
    pub username: String,
    pub password: String,
    pub is_admin: Option<bool>,
    pub is_system: Option<bool>,
    pub is_approved: Option<bool>,
}

pub async fn create_user(
    State(db): State<Db>,
    _admin: Extension<AdminFlag>,
    Extension(actor): Extension<CurrentUser>,
    Json(payload): Json<CreateUserPayload>,
) -> Result<Json<User>, AppError> {
    let uname = payload.username.trim();
    if uname.is_empty() {
        return Err(AppError::BadRequest("username required".into()));
    }
    if payload.password.len() < 8 {
        return Err(AppError::BadRequest("password too short".into()));
    }
    let salt = SaltString::generate(&mut OsRng);
    let argon2 = Argon2::default();
    let password_hash = argon2
        .hash_password(payload.password.as_bytes(), &salt)
        .map_err(|_| AppError::Internal)?
        .to_string();
    let mut user = db
        .create_user(NewUser {
            username: uname.to_string(),
            password_hash,
            is_system: payload.is_system.unwrap_or(false),
            is_approved: payload.is_approved.unwrap_or(true),
        })
        .await
        .map_err(|_| AppError::Internal)?;
    if payload.is_admin.unwrap_or(false) {
        let mut fields = UpdateUserFields::default();
        fields.is_admin = Some(true);
        user = db
            .update_user(&user.id, fields)
            .await
            .map_err(|_| AppError::Internal)?
            .unwrap_or(user);
    }
    audit::record_entity(
        &db,
        Some(actor.id.as_str()),
        "user.create",
        "user",
        &user.id.to_string(),
    )
    .await;
    Ok(Json(sanitize_user(user)))
}

#[derive(serde::Deserialize)]
pub struct AdminPasswordResetPayload {
    pub password: String,
}

pub async fn admin_password_reset(
    State(db): State<Db>,
    _admin: Extension<AdminFlag>,
    Extension(actor): Extension<CurrentUser>,
    Path(id): Path<String>,
    Json(payload): Json<AdminPasswordResetPayload>,
) -> Result<Json<User>, AppError> {
    if payload.password.len() < 8 {
        return Err(AppError::BadRequest("password too short".into()));
    }
    let salt = SaltString::generate(&mut OsRng);
    let argon2 = Argon2::default();
    let hash = argon2
        .hash_password(payload.password.as_bytes(), &salt)
        .map_err(|_| AppError::Internal)?
        .to_string();
    let mut fields = UpdateUserFields::default();
    fields.password_hash = Some(hash);
    fields.must_change_password = Some(false);
    let user = db
        .update_user(&id, fields)
        .await
        .map_err(|_| AppError::Internal)?
        .ok_or(AppError::NotFound)?;
    audit::record_entity(
        &db,
        Some(actor.id.as_str()),
        "user.admin_password_reset",
        "user",
        &id,
    )
    .await;
    Ok(Json(sanitize_user(user)))
}

#[derive(serde::Serialize)]
pub struct NamesItem {
    pub id: String,
    pub name: String,
}
