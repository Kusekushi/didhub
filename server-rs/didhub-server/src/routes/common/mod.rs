use didhub_db::{groups::GroupOperations, subsystems::SubsystemOperations, Db};
use didhub_error::AppError;
use didhub_middleware::types::CurrentUser;
use std::collections::HashSet;
use tracing::{error, warn};

fn push_unique(acc: &mut Vec<i64>, seen: &mut HashSet<i64>, value: i64) {
    if seen.insert(value) {
        acc.push(value);
    }
}

fn parse_single_id(text: &str) -> Option<i64> {
    let cleaned = text.trim().trim_start_matches('#');
    if cleaned.is_empty() {
        return None;
    }
    cleaned.parse::<i64>().ok()
}

fn parse_string_ids(text: &str, acc: &mut Vec<i64>, seen: &mut HashSet<i64>) {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return;
    }
    if let Ok(value) = serde_json::from_str::<serde_json::Value>(trimmed) {
        collect_leader_ids(&value, acc, seen);
        return;
    }
    for segment in trimmed.split(',') {
        if let Some(id) = parse_single_id(segment) {
            push_unique(acc, seen, id);
        }
    }
}

fn collect_leader_ids(value: &serde_json::Value, acc: &mut Vec<i64>, seen: &mut HashSet<i64>) {
    match value {
        serde_json::Value::Array(items) => {
            for item in items {
                collect_leader_ids(item, acc, seen);
            }
        }
        serde_json::Value::Object(map) => {
            if let Some(id_value) = map.get("id") {
                collect_leader_ids(id_value, acc, seen);
            }
        }
        serde_json::Value::Number(num) => {
            if let Some(id) = num.as_i64() {
                push_unique(acc, seen, id);
            }
        }
        serde_json::Value::String(text) => parse_string_ids(text, acc, seen),
        _ => {}
    }
}

pub fn parse_leaders(raw: &serde_json::Value) -> Vec<i64> {
    let mut acc: Vec<i64> = Vec::new();
    let mut seen: HashSet<i64> = HashSet::new();
    collect_leader_ids(raw, &mut acc, &mut seen);
    acc
}

fn collect_text_values(value: &serde_json::Value, acc: &mut Vec<String>) {
    match value {
        serde_json::Value::Array(items) => {
            for item in items {
                collect_text_values(item, acc);
            }
        }
        serde_json::Value::String(text) => {
            let trimmed = text.trim();
            if !trimmed.is_empty() {
                acc.push(trimmed.to_owned());
            }
        }
        serde_json::Value::Number(num) => {
            acc.push(num.to_string());
        }
        serde_json::Value::Bool(flag) => {
            acc.push(flag.to_string());
        }
        serde_json::Value::Object(map) => {
            if let Some(nested) = map
                .get("name")
                .or_else(|| map.get("label"))
                .or_else(|| map.get("value"))
                .or_else(|| map.get("title"))
                .or_else(|| map.get("text"))
                .or_else(|| map.get("id"))
            {
                collect_text_values(nested, acc);
            }
        }
        _ => {}
    }
}

fn dedupe_strings<I: IntoIterator<Item = String>>(items: I) -> Vec<String> {
    let mut seen: HashSet<String> = HashSet::new();
    items
        .into_iter()
        .filter_map(|item| {
            let trimmed = item.trim();
            if trimmed.is_empty() {
                return None;
            }
            let normalized = trimmed.to_owned();
            if seen.insert(normalized.clone()) {
                Some(normalized)
            } else {
                None
            }
        })
        .collect()
}

pub fn normalize_string_list(raw: Option<&str>) -> Vec<String> {
    let Some(raw) = raw.map(str::trim).filter(|s| !s.is_empty()) else {
        return Vec::new();
    };

    if raw.starts_with('[') {
        if let Ok(value) = serde_json::from_str::<serde_json::Value>(raw) {
            let mut collected: Vec<String> = Vec::new();
            collect_text_values(&value, &mut collected);
            return dedupe_strings(collected);
        }
    }

    let segments = raw
        .split(|c: char| matches!(c, ',' | ';' | '\n' | '\r'))
        .map(str::trim)
        .map(str::to_owned);
    dedupe_strings(segments)
}

pub fn normalize_image_list(raw: Option<&str>) -> Vec<String> {
    let mut seen: HashSet<String> = HashSet::new();
    normalize_string_list(raw)
        .into_iter()
        .filter_map(|value| {
            let trimmed = value.trim();
            if trimmed.is_empty() {
                return None;
            }
            let normalized = if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
                trimmed.to_owned()
            } else if let Some(rest) = trimmed.strip_prefix("/did-system/") {
                format!("/uploads/{}", rest.trim_start_matches('/'))
            } else if let Some(rest) = trimmed.strip_prefix("/uploads/") {
                format!("/uploads/{}", rest.trim_start_matches('/'))
            } else if trimmed.starts_with('/') {
                format!("/uploads/{}", trimmed.trim_start_matches('/'))
            } else {
                format!("/uploads/{}", trimmed)
            };
            if seen.insert(normalized.clone()) {
                Some(normalized)
            } else {
                None
            }
        })
        .collect()
}

pub fn require_admin(user: &CurrentUser) -> Result<(), AppError> {
    if !user.is_admin {
        warn!(
            user_id = %user.id,
            username = %user.username,
            "unauthorized admin action"
        );
        return Err(AppError::Forbidden);
    }
    Ok(())
}

pub fn check_ownership_with_existing(
    user: &CurrentUser,
    owner_id: Option<i64>,
) -> Result<(), AppError> {
    if user.is_admin {
        return Ok(());
    }
    let owner = owner_id.unwrap_or(user.id);
    if owner != user.id {
        warn!(
            user_id = %user.id,
            owner_id = %owner,
            "User attempted to access entity without permission"
        );
        return Err(AppError::Forbidden);
    }
    Ok(())
}

pub async fn check_subsystem_ownership(
    db: &Db,
    user: &CurrentUser,
    id: i64,
) -> Result<(), AppError> {
    if user.is_admin {
        return Ok(());
    }
    if let Some(existing) = db.fetch_subsystem(id).await.map_err(|e| {
        error!(user_id = %user.id, subsystem_id = %id, error = %e, "Failed to fetch subsystem for permission check");
        AppError::Internal
    })? {
        let owner_id = existing.owner_user_id.unwrap_or(user.id);
        if owner_id != user.id {
            warn!(user_id = %user.id, subsystem_id = %id, owner_id = %owner_id, "User attempted to access subsystem without permission");
            return Err(AppError::Forbidden);
        }
    }
    Ok(())
}

pub async fn check_group_ownership(db: &Db, user: &CurrentUser, id: i64) -> Result<(), AppError> {
    if user.is_admin {
        return Ok(());
    }
    if let Some(existing) = db.fetch_group(id).await.map_err(|e| {
        error!(user_id = %user.id, group_id = %id, error = %e, "Failed to fetch group for permission check");
        AppError::Internal
    })? {
        let owner_id = existing.owner_user_id.unwrap_or(user.id);
        if owner_id != user.id {
            warn!(user_id = %user.id, group_id = %id, owner_id = %owner_id, "User attempted to access group without permission");
            return Err(AppError::Forbidden);
        }
    }
    Ok(())
}
