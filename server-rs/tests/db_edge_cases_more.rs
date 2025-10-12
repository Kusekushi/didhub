use didhub_server::{config::AppConfig, db::Db, logging};
use std::fs;
use uuid::Uuid;

fn test_cfg() -> AppConfig {
    let mut cfg = AppConfig::default_for_tests();
    cfg.jwt_secret = "testsecret".into();
    cfg
}

async fn new_test_db() -> (Db, AppConfig) {
    let id = Uuid::new_v4();
    let file = format!("test-{}.db", id);
    let path = std::path::Path::new(&file);
    if path.exists() { let _ = fs::remove_file(path); }
    let cfg = test_cfg();
    let sqlite_url = format!("sqlite://{}", file.replace('\\', "/"));
    let pool = sqlx::any::AnyPoolOptions::new().max_connections(1).connect(&sqlite_url).await.expect("connect sqlite");
    let db = Db::from_any_pool(pool, didhub_server::db::DbBackend::Sqlite, sqlite_url.clone());
    (db, cfg)
}

#[tokio::test]
async fn replace_parents_children_affiliations_self_and_duplicates() {
    let (db, cfg) = new_test_db().await;
    logging::init(false);
    let app_components = didhub_server::build_app(db.clone(), cfg.clone()).await;
    let _app = app_components.router;

    // Insert three alters and get their string IDs via DB helper
    let a1 = db.create_alter(&serde_json::json!({"name":"P1"})).await.unwrap().id;
    let a2 = db.create_alter(&serde_json::json!({"name":"P2"})).await.unwrap().id;
    let a3 = db.create_alter(&serde_json::json!({"name":"P3"})).await.unwrap().id;

    // Call DB helpers directly to simulate replace_* behavior (they should ignore self refs and dedupe)
    db.replace_parents(a1, &[a1, a2, a2]).await.unwrap();
    let parents = db.parents_of(a1).await.unwrap();
    assert_eq!(parents, vec![a2]);

    db.replace_children(a2, &[a2, a1, a1, a3]).await.unwrap();
    let children = db.children_of(a2).await.unwrap();
    // children should contain a1 and a3 only
    assert!(children.contains(&a1) && children.contains(&a3));

    // Use string affiliation ids; include a3 and a synthetic affiliation id
    let synthetic = uuid::Uuid::new_v4().to_string();
    db.replace_affiliations(&a3, &[a3.clone(), synthetic.clone(), synthetic.clone()]).await.unwrap();
    let affs = db.affiliations_of(&a3).await.unwrap();
    // should include a3 and synthetic, duplicates deduped
    assert!(affs.contains(&a3) && affs.contains(&synthetic) && affs.len() == 2);
}
