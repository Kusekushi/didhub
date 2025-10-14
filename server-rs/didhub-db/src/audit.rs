use crate::{common::CommonOperations, Db};
use serde_json::json;
use tracing::debug;

pub async fn record_simple(db: &Db, user_id: Option<&str>, action: &str, ip: Option<&str>) {
    debug!(user_id=?user_id, action=%action, ip=?ip, "recording audit event");
    let _ = db
        .insert_audit(user_id, action, None, None, ip, None)
        .await;
}

pub async fn record_entity(
    db: &Db,
    user_id: Option<&str>,
    action: &str,
    entity_type: &str,
    entity_id: &str,
    ip: Option<&str>,
) {
    debug!(user_id=?user_id, action=%action, entity_type=%entity_type, entity_id=%entity_id, ip=?ip, "recording audit event");
    let _ = db
        .insert_audit(
            user_id,
            action,
            Some(entity_type),
            Some(entity_id),
            ip,
            None,
        )
        .await;
}

pub async fn record_with_metadata(
    db: &Db,
    user_id: Option<&str>,
    action: &str,
    entity_type: Option<&str>,
    entity_id: Option<&str>,
    metadata: serde_json::Value,
    ip: Option<&str>,
) {
    debug!(user_id=?user_id, action=%action, entity_type=?entity_type, entity_id=?entity_id, metadata=?metadata, ip=?ip, "recording audit event with metadata");
    let _ = db
        .insert_audit(
            user_id,
            action,
            entity_type,
            entity_id,
            ip,
            Some(&metadata),
        )
        .await;
}

pub async fn record_settings_update(db: &Db, user_id: Option<&str>, key: &str, ip: Option<&str>) {
    let meta = json!({"key": key});
    let _ = db
        .insert_audit(
            user_id,
            "settings.update",
            Some("setting"),
            Some(key),
            ip,
            Some(&meta),
        )
        .await;
}
