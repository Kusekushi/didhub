use didhub_server::db::Db;
use tempfile::NamedTempFile;

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
    // Insert orphan affiliation referencing non-existent group and alter (use UUID strings)
    let orphan_aff = uuid::Uuid::new_v4().to_string();
    let orphan_alt = uuid::Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO alter_affiliations (affiliation_id, alter_id) VALUES (?1, ?2)").bind(&orphan_aff).bind(&orphan_alt).execute(&db.pool).await.unwrap();
    // Insert orphan subsystem membership referencing missing subsystem/alter
    let orphan_sub = uuid::Uuid::new_v4().to_string();
    let orphan_alt2 = uuid::Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO alter_subsystems (alter_id, subsystem_id) VALUES (?1, ?2)").bind(&orphan_alt2).bind(&orphan_sub).execute(&db.pool).await.unwrap();
    let removed_aff = db.prune_orphan_group_members().await.unwrap();
    let removed_sub = db.prune_orphan_subsystem_members().await.unwrap();
    assert!(removed_aff >= 1, "should remove orphan group affiliation");
    assert!(removed_sub >= 1, "should remove orphan subsystem membership");
}
