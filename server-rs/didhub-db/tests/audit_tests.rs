use anyhow::Result;
use didhub_db::common::CommonOperations;
use didhub_db::users::UserOperations;
use didhub_db::Db;
use serde_json::json;

#[tokio::test]
async fn audit_insert_generates_id_and_stores_ip() -> Result<()> {
    // in-memory AnyPool for sqlite with migrations (shared cache to allow multiple connections)
    let url = "sqlite::memory:?cache=shared";
    // Ensure drivers are installed for sqlx::any
    sqlx::any::install_default_drivers();
    let pool = sqlx::any::AnyPoolOptions::new()
        .max_connections(1)
        .connect(url)
        .await?;
    // Run sqlite migrations so schema exists
    didhub_migrations::sqlite_migrator().run(&pool).await?;
    let db = Db::from_any_pool(pool, didhub_db::models::DbBackend::Sqlite, url.to_string());

    // Create a couple of users so audit.user_id foreign key constraints are satisfied
    let nu1 = didhub_db::NewUser {
        username: "audit-user-1".to_string(),
        password_hash: "hash".to_string(),
        is_system: false,
        is_approved: true,
    };
    let created1 = db.create_user(nu1).await?;

    // Insert with an IP provided
    let meta = json!({"k": "v"});
    db.insert_audit(
        Some(created1.id.as_str()),
        "test.action",
        Some("entity"),
        Some("ent1"),
        Some("1.2.3.4"),
        Some(&meta),
    )
    .await?;

    // Query back the inserted audit row
    let rows = db
        .list_audit(Some("test.action"), None, None, None, 10, 0)
        .await?;
    assert!(!rows.is_empty(), "expected at least one audit row");
    let first = &rows[0];
    // id should be a non-empty string and parse as UUID
    assert!(!first.id.is_empty(), "audit id must not be empty");
    uuid::Uuid::parse_str(&first.id).expect("audit.id should be a valid UUID");
    // ip should be preserved
    assert_eq!(first.ip.as_deref(), Some("1.2.3.4"));

    // Insert another row without IP for a second user
    let nu2 = didhub_db::NewUser {
        username: "audit-user-2".to_string(),
        password_hash: "hash".to_string(),
        is_system: false,
        is_approved: true,
    };
    let created2 = db.create_user(nu2).await?;
    db.insert_audit(
        Some(created2.id.as_str()),
        "test.action",
        None,
        None,
        None,
        None,
    )
    .await?;
    // Query specifically for audits for created2.user id
    let rows2 = db
        .list_audit(None, Some(created2.id.as_str()), None, None, 10, 0)
        .await?;
    assert!(
        !rows2.is_empty(),
        "expected to find at least one audit row for user 2"
    );
    for r in rows2.iter() {
        assert_eq!(r.user_id.as_deref(), Some(created2.id.as_str()));
        assert_eq!(r.ip, None, "expected ip to be None when not provided");
        uuid::Uuid::parse_str(&r.id).expect("audit.id should be a valid UUID");
    }

    Ok(())
}
