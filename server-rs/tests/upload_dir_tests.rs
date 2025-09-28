use tempfile::tempdir;
use didhub_server::upload_dir::UploadDirCache;
use didhub_server::db::Db;

#[tokio::test]
async fn refresh_ttl_updates_from_db() {
    // Use no-db cache and set TTL programmatically to simulate DB refresh
    let default_dir = "uploads_test".to_string();
    let udc = UploadDirCache::new_no_db(default_dir.clone(), 60);
    let ttl_before = udc.get_ttl_secs().await;
    assert_eq!(ttl_before, 60);
    // simulate DB changed TTL
    udc.set_ttl_secs(2).await;
    let ttl_after = udc.get_ttl_secs().await;
    assert_eq!(ttl_after, 2);
}

#[tokio::test]
async fn migrate_moves_files_between_dirs() {
    // create temp dirs
    let from = tempdir().expect("temp from");
    let to = tempdir().expect("temp to");
    let from_path = from.path().to_path_buf();
    let to_path = to.path().to_path_buf();

    // create some files in from
    let file1 = from_path.join("a.txt");
    tokio::fs::write(&file1, b"hello").await.expect("write");
    let file2 = from_path.join("b.txt");
    tokio::fs::write(&file2, b"world").await.expect("write");

    // Use no-db cache for migration test
    let udc = UploadDirCache::new_no_db(to_path.to_string_lossy().to_string(), 60);
    // set internal state for migration
    udc.set_internal_state(Some(from_path.to_string_lossy().to_string()), to_path.to_string_lossy().to_string()).await;

    let (moved, skipped) = udc.migrate_previous_to_current().await.expect("migrate");
    assert_eq!(moved, 2);
    assert_eq!(skipped, 0);

    // verify files exist in to
    assert!(to_path.join("a.txt").exists());
    assert!(to_path.join("b.txt").exists());
}
