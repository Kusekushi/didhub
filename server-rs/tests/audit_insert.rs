use didhub_db::models::*;
use didhub_db::Db;
use chrono::Utc;

#[tokio::test]
async fn insert_audit_creates_row_with_id() {
    // Create a fresh temp sqlite file for the test
    let db_file = format!("test-audit-{}.sqlite", uuid::Uuid::new_v4());
    let db = Db::connect_with_file(&db_file).await.expect("connect sqlite");

    // Call insert_audit
    let metadata = Some(serde_json::json!({"k":"v"}));
    db.insert_audit(None, "test.action", Some("entity"), Some("e1"), Some("127.0.0.1"), metadata.as_ref()).await.expect("insert audit");

    // Query the audit_log table for the inserted row
    let rows: Vec<(String, String, Option<String>, String, Option<String>, Option<String>, Option<String>, Option<String>)> =
        sqlx::query_as("SELECT id, created_at, user_id, action, entity_type, entity_id, ip, metadata FROM audit_log WHERE action = ?1")
            .bind("test.action")
            .fetch_all(&db.pool)
            .await
            .expect("fetch audit rows");

    assert!(!rows.is_empty(), "no audit rows found");
    // Verify the first row has a non-empty id and correct action
    let (id, _created_at, _user_id, action, _entity_type, _entity_id, _ip, _metadata) = &rows[0];
    assert!(!id.is_empty(), "id should not be empty");
    // id should be a valid UUID
    let parsed = uuid::Uuid::parse_str(id);
    assert!(parsed.is_ok(), "id should be a valid UUID: {}", id);
    assert_eq!(action, "test.action");
}
