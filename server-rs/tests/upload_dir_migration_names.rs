use didhub_server::upload_dir::UploadDirCache;
use std::fs;
use tempfile::tempdir;

#[tokio::test]
async fn test_migrate_previous_to_current_with_names_moves_files() {
    // create temporary directories
    let from_dir = tempdir().unwrap();
    let to_dir = tempdir().unwrap();

    let from_path = from_dir.path().to_string_lossy().to_string();
    let to_path = to_dir.path().to_string_lossy().to_string();

    // create some files and a subdir in from_dir
    let file1 = from_dir.path().join("a.txt");
    let file2 = from_dir.path().join("b.bin");
    let subdir = from_dir.path().join("subdir");
    fs::write(&file1, b"hello").unwrap();
    fs::write(&file2, b"world").unwrap();
    fs::create_dir_all(&subdir).unwrap();

    // construct UploadDirCache without DB
    let udc = UploadDirCache::new_no_db(to_path.clone(), 60);

    // set internal state so last_value = from, value = to
    udc.set_internal_state(Some(from_path.clone()), to_path.clone()).await;

    // run migration
    let (moved, skipped) = udc
        .migrate_previous_to_current_with_names()
        .await
        .expect("migration failed");

    // moved should include a.txt and b.bin
    assert!(moved.contains(&"a.txt".to_string()));
    assert!(moved.contains(&"b.bin".to_string()));

    // skipped should include subdir
    assert!(skipped.contains(&"subdir".to_string()));

    // total count should match
    assert_eq!(moved.len() + skipped.len(), 3);
}
