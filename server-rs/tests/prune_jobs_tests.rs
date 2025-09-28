use didhub_server::db::Db;
use tempfile::NamedTempFile;

#[tokio::test]
async fn test_prune_old_shortlinks() {
    let tf = NamedTempFile::new().unwrap();
    let path = tf.path().to_string_lossy().to_string();
    // Initialize SQLite file with migrations by connecting (Db::connect_with_file assumed existing helper? Use existing connect code.)
    if std::path::Path::new(&path).exists() { let _ = std::fs::remove_file(&path); }
    if let Some(p) = std::path::Path::new(&path).parent() { std::fs::create_dir_all(p).ok(); }
    let _ = std::fs::OpenOptions::new().create(true).write(true).open(&path).expect("create sqlite file");
    sqlx::any::install_default_drivers();
    if std::path::Path::new(&path).exists() { let _ = std::fs::remove_file(&path); }
    if let Some(p) = std::path::Path::new(&path).parent() { std::fs::create_dir_all(p).ok(); }
    let _ = std::fs::OpenOptions::new().create(true).write(true).open(&path).expect("create sqlite file");
    sqlx::any::install_default_drivers();
    let db = Db::connect_with_file(&path).await.expect("db connect");
    // Insert two shortlinks with manipulated created_at (direct SQL since helper doesn't set custom date)
    sqlx::query("INSERT INTO shortlinks (token, target, created_at) VALUES (?1, ?2, datetime('now','-200 days'))")
        .bind("old1").bind("https://old1")
    .execute(&db.pool).await.unwrap();
    sqlx::query("INSERT INTO shortlinks (token, target, created_at) VALUES (?1, ?2, datetime('now','-10 days'))")
        .bind("new1").bind("https://new1")
    .execute(&db.pool).await.unwrap();
    let cutoff = (chrono::Utc::now() - chrono::Duration::days(180)).to_rfc3339();
    let pruned = db.prune_old_shortlinks(&cutoff).await.unwrap();
    assert_eq!(pruned, 1, "should prune only old shortlink");
}

#[tokio::test]
async fn test_prune_orphan_members() {
    let tf = NamedTempFile::new().unwrap();
    let path = tf.path().to_string_lossy().to_string();
    if std::path::Path::new(&path).exists() { let _ = std::fs::remove_file(&path); }
    if let Some(p) = std::path::Path::new(&path).parent() { std::fs::create_dir_all(p).ok(); }
    let _ = std::fs::OpenOptions::new().create(true).write(true).open(&path).expect("create sqlite file");
    sqlx::any::install_default_drivers();
    if std::path::Path::new(&path).exists() { let _ = std::fs::remove_file(&path); }
    if let Some(p) = std::path::Path::new(&path).parent() { std::fs::create_dir_all(p).ok(); }
    let _ = std::fs::OpenOptions::new().create(true).write(true).open(&path).expect("create sqlite file");
    sqlx::any::install_default_drivers();
    let db = Db::connect_with_file(&path).await.expect("db connect");
    // Insert orphan affiliation referencing non-existent group and alter
    sqlx::query("INSERT INTO alter_affiliations (affiliation_id, alter_id) VALUES (9999, 8888)").execute(&db.pool).await.unwrap();
    // Insert orphan subsystem membership referencing missing subsystem/alter
    sqlx::query("INSERT INTO alter_subsystems (alter_id, subsystem_id) VALUES (7777, 6666)").execute(&db.pool).await.unwrap();
    let removed_aff = db.prune_orphan_group_members().await.unwrap();
    let removed_sub = db.prune_orphan_subsystem_members().await.unwrap();
    assert!(removed_aff >= 1, "should remove orphan group affiliation");
    assert!(removed_sub >= 1, "should remove orphan subsystem membership");
}
