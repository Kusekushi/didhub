use std::env;
use didhub_server::db::Db;
use didhub_server::db::DbBackend;

#[tokio::test]
async fn integration_mysql_basic() {
    if env::var("RUN_DB_INTEGRATION_TESTS").is_err() { eprintln!("skipping mysql integration tests"); return; }
    let db_url = env::var("DIDHUB_DB").unwrap_or_else(|_| "mysql://didhub:example@127.0.0.1:3307/didhub_test".into());
    sqlx::any::install_default_drivers();
    let pool = sqlx::any::AnyPoolOptions::new().max_connections(5).connect(&db_url).await.expect("connect mysql");
    let db = Db::from_any_pool(pool, DbBackend::MySql, db_url.clone());

    let g = db.create_group("intmysql", Some("desc"), None, &[], None, None).await.expect("create group");
    let got = db.fetch_group(g.id).await.expect("fetch").expect("group exists");
    assert_eq!(got.id, g.id);

    // upsert_setting
    db.upsert_setting("integration_test_key", &serde_json::to_string(&true).unwrap()).await.expect("upsert");
    let s = db.get_setting("integration_test_key").await.expect("get").expect("exists");
    assert!(serde_json::from_str::<bool>(&s.value).unwrap());

    // create_user
    let nu = didhub_server::db::NewUser { username: "intmysql_user".into(), password_hash: "pw_hash".into(), is_system: false, is_approved: true };
    let u = db.create_user(nu).await.expect("create user");
    assert_eq!(u.username, "intmysql_user");
}
