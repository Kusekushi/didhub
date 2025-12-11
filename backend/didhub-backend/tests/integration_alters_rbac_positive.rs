use std::collections::HashMap;
use std::sync::Arc;

use didhub_db::{create_pool, DbConnectionConfig};
use didhub_log_client::LogToolClient;

use didhub_auth::TestAuthenticator;
use didhub_backend::generated::routes::{create_alter, delete_alter, update_alter};
use didhub_backend::state::AppState;
use sqlx::Row;
use uuid::Uuid;

#[tokio::test]
async fn owner_and_admin_can_modify_alter() {
    let config = DbConnectionConfig::new("sqlite::memory:");
    let pool = create_pool(&config).await.expect("create pool");

    sqlx::query(
        r#"CREATE TABLE alters (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            name TEXT NOT NULL,
            description TEXT,
            age TEXT,
            gender TEXT,
            pronouns TEXT,
            birthday TEXT,
            sexuality TEXT,
            species TEXT,
            alter_type TEXT,
            job TEXT,
            weapon TEXT,
            triggers TEXT NOT NULL,
            metadata TEXT NOT NULL,
            soul_songs TEXT NOT NULL,
            interests TEXT NOT NULL,
            notes TEXT,
            images TEXT NOT NULL,
            system_roles TEXT NOT NULL,
            is_system_host INTEGER NOT NULL,
            is_dormant INTEGER NOT NULL,
            is_merged INTEGER NOT NULL,
            owner_user_id TEXT NOT NULL,
            created_at TEXT NOT NULL
        )"#,
    )
    .execute(&pool)
    .await
    .expect("create table");

    let log_dir = std::env::temp_dir().join("didhub_test_logs");
    std::fs::create_dir_all(&log_dir).expect("create log dir");
    let log = LogToolClient::new(log_dir.to_str().unwrap());

    // create users table using full migrations schema so generated queries match
    sqlx::query(
        r#"CREATE TABLE users (
            id TEXT PRIMARY KEY,
            username TEXT NOT NULL,
            about_me TEXT,
            password_hash TEXT NOT NULL,
            avatar TEXT,
            must_change_password INTEGER NOT NULL,
            last_login_at TEXT,
            display_name TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            roles TEXT NOT NULL,
            settings TEXT NOT NULL
        )"#,
    )
    .execute(&pool)
    .await
    .expect("create users table");
    let owner_id = "00000000-0000-0000-0000-000000000020";
    // insert owner using generated helper so types match (Uuid vs String)
    let mut insert_conn = pool.acquire().await.expect("acquire");
    let owner_uuid = uuid::Uuid::parse_str(owner_id).unwrap();
    let owner_row = didhub_db::generated::users::UsersRow {
        id: owner_uuid,
        username: "owner".to_string(),
        about_me: None,
        password_hash: "x".to_string(),
        avatar: None,
        must_change_password: 0,
        last_login_at: None,
        display_name: None,
        created_at: "now".to_string(),
        updated_at: "now".to_string(),
        roles: "[\"system\", \"user\"]".to_string(),
        settings: "{}".to_string(),
    };
    didhub_db::generated::users::insert_user(&mut *insert_conn, &owner_row)
        .await
        .expect("insert owner user");
    // debug: verify the user row exists and has system role
    if let Ok(row) = sqlx::query("SELECT id, roles FROM users WHERE id = ?")
        .bind(owner_id)
        .fetch_one(&pool)
        .await
    {
        let id_val: String = row.try_get("id").unwrap_or_default();
        let roles_val: String = row.try_get("roles").unwrap_or_default();
        eprintln!("debug: user row in DB id={} roles={}", id_val, roles_val);
    } else {
        eprintln!("debug: failed to fetch inserted user row");
    }
    // debug: use generated helper matching the handler
    let mut conn = pool.acquire().await.expect("acquire");
    match didhub_db::generated::users::find_by_primary_key(
        &mut *conn,
        &uuid::Uuid::parse_str(owner_id).unwrap(),
    )
    .await
    {
        Ok(opt) => match opt {
            Some(r) => eprintln!("debug: generated helper returned user roles={}", r.roles),
            None => eprintln!("debug: generated helper returned None"),
        },
        Err(e) => eprintln!("debug: generated helper returned Err: {:?}", e),
    }
    let owner_auth = std::sync::Arc::from(Box::new(TestAuthenticator::new_with(
        vec!["user".to_string()],
        Some(Uuid::parse_str(owner_id).unwrap()),
    )) as Box<dyn didhub_auth::AuthenticatorTrait>);
    let state = AppState::new(
        pool.clone(),
        log.clone(),
        owner_auth,
        didhub_job_queue::JobQueueClient::new(),
        didhub_updates::UpdateCoordinator::new(),
    );
    let arc_state = Arc::new(state);

    // Build headers with a dummy Authorization token so TestAuthenticator is invoked
    let mut headers = axum::http::HeaderMap::new();
    headers.insert(
        axum::http::header::AUTHORIZATION,
        axum::http::HeaderValue::from_static("Bearer test-token"),
    );

    let body = serde_json::json!({ "user_id": owner_id, "name": "OwnerAlter" });
    let res = create_alter(
        axum::Extension(arc_state.clone()),
        headers.clone(),
        Some(axum::Json(body)),
    )
    .await;
    if let Err(e) = &res {
        eprintln!("create: {:?}", e);
    }
    let res = res.expect("create");
    let created = res.0;
    let id = created
        .get("id")
        .and_then(|v| v.as_str())
        .expect("id")
        .to_string();

    // Update as owner (should succeed)
    let mut path = HashMap::new();
    path.insert("alterId".to_string(), id.clone());
    let update_body = serde_json::json!({ "name": "OwnerUpdatedName" });

    let update_res = update_alter(
        axum::Extension(arc_state.clone()),
        headers.clone(),
        axum::extract::Path(path.clone()),
        Some(axum::Json(update_body)),
    )
    .await;
    if let Err(e) = &update_res {
        eprintln!("update_alter error: {:?}", e);
    }
    assert!(update_res.is_ok());

    // Now attempt delete as admin
    let admin_auth = std::sync::Arc::from(Box::new(TestAuthenticator::new_with(
        vec!["admin".to_string()],
        None,
    )) as Box<dyn didhub_auth::AuthenticatorTrait>);
    let state2 = AppState::new(
        pool.clone(),
        log,
        admin_auth,
        didhub_job_queue::JobQueueClient::new(),
        didhub_updates::UpdateCoordinator::new(),
    );
    let arc_state2 = Arc::new(state2);

    // Headers for admin
    let mut headers2 = axum::http::HeaderMap::new();
    headers2.insert(
        axum::http::header::AUTHORIZATION,
        axum::http::HeaderValue::from_static("Bearer test-token"),
    );

    let delete_res = delete_alter(
        axum::Extension(arc_state2.clone()),
        headers2,
        axum::extract::Path(path.clone()),
    )
    .await;
    assert!(delete_res.is_ok());
}
