use std::env;
use didhub_server::db::Db;
use didhub_server::db::DbBackend;

#[tokio::test]
async fn integration_postgres_basic() {
    // Skip unless env var set
    if env::var("RUN_DB_INTEGRATION_TESTS").is_err() { eprintln!("skipping pg integration tests"); return; }
    let db_url = env::var("DIDHUB_DB").unwrap_or_else(|_| "postgres://didhub:example@127.0.0.1:5433/didhub_test".into());
    sqlx::any::install_default_drivers();
    let pool = sqlx::any::AnyPoolOptions::new().max_connections(5).connect(&db_url).await.expect("connect pg");
    let db = Db::from_any_pool(pool, DbBackend::Postgres, db_url.clone());

    // run simple lifecycle: create a group and fetch it
    let g = db.create_group("intpg", Some("desc"), None, &[], None, None).await.expect("create group");
    let got = db.fetch_group(g.id).await.expect("fetch").expect("group exists");
    assert_eq!(got.id, g.id);

    // Test upsert_setting: insert then update
    db.upsert_setting("integration_test_key", &serde_json::to_string(&true).unwrap()).await.expect("upsert");
    let s = db.get_setting("integration_test_key").await.expect("get").expect("exists");
    assert!(serde_json::from_str::<bool>(&s.value).unwrap());
    db.upsert_setting("integration_test_key", &serde_json::to_string(&false).unwrap()).await.expect("upsert2");
    let s2 = db.get_setting("integration_test_key").await.expect("get2").expect("exists2");
    assert!(!serde_json::from_str::<bool>(&s2.value).unwrap());

    // Test create_user insert+return (unique username)
    let nu = didhub_server::db::NewUser { username: "intpg_user".into(), password_hash: "pw_hash".into(), is_system: false, is_approved: true };
    let u = db.create_user(nu).await.expect("create user");
    assert_eq!(u.username, "intpg_user");
}
