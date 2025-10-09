use crate::{common::CommonOperations, Db};
use serde_json::json;
use tracing::debug;

pub async fn record_simple(db: &Db, user_id: Option<String>, action: &str) {
    debug!(user_id=?user_id, action=%action, "recording audit event");
    let _ = db
        .insert_audit(user_id, action, None, None, None, None)
        .await;
}

pub async fn record_entity(
    db: &Db,
    user_id: Option<String>,
    action: &str,
    entity_type: &str,
    entity_id: &str,
) {
    debug!(user_id=?user_id, action=%action, entity_type=%entity_type, entity_id=%entity_id, "recording audit event");
    let _ = db
        .insert_audit(
            user_id,
            action,
            Some(entity_type),
            Some(entity_id),
            None,
            None,
        )
        .await;
}

pub async fn record_with_metadata(
    db: &Db,
    user_id: Option<String>,
    action: &str,
    entity_type: Option<&str>,
    entity_id: Option<&str>,
    metadata: serde_json::Value,
) {
    debug!(user_id=?user_id, action=%action, entity_type=?entity_type, entity_id=?entity_id, metadata=?metadata, "recording audit event with metadata");
    let _ = db
        .insert_audit(
            user_id,
            action,
            entity_type,
            entity_id,
            None,
            Some(&metadata),
        )
        .await;
}

pub async fn record_settings_update(db: &Db, user_id: Option<String>, key: &str) {
    let meta = json!({"key": key});
    let _ = db
        .insert_audit(
            user_id,
            "settings.update",
            Some("setting"),
            Some(key),
            None,
            Some(&meta),
        )
        .await;
}
