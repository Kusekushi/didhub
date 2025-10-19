#[allow(unused_imports)]
use std::collections::HashMap;
use std::sync::Arc;

use didhub_db::{create_pool, DbConnectionConfig};
use didhub_log_client::LogToolClient;

use didhub_auth::TestAuthenticator;
use didhub_backend::state::AppState;
use uuid::Uuid;

use didhub_backend::handlers::{alters, relationships, uploads};

fn auth_headers() -> axum::http::HeaderMap {
    let mut headers = axum::http::HeaderMap::new();
    headers.insert(
        axum::http::header::AUTHORIZATION,
        axum::http::HeaderValue::from_static("Bearer test-token"),
    );
    headers
}

#[tokio::test]
async fn system_user_restrictions() {
    let config = DbConnectionConfig::new("sqlite::memory:");
    let pool = create_pool(&config).await.expect("create pool");

    // Create tables: users (full schema), alters, uploads, relationships
    sqlx::query(
        r#"CREATE TABLE users (
            id TEXT PRIMARY KEY,
            username TEXT NOT NULL,
            about_me TEXT,
            password_hash TEXT NOT NULL,
            avatar TEXT,
            is_system INTEGER NOT NULL,
            is_approved INTEGER NOT NULL,
            must_change_password INTEGER NOT NULL,
            is_active INTEGER NOT NULL,
            email_verified INTEGER NOT NULL,
            last_login_at TEXT,
            display_name TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            is_admin INTEGER NOT NULL,
            roles TEXT NOT NULL,
            settings TEXT NOT NULL
        )"#,
    )
    .execute(&pool)
    .await
    .expect("create users table");

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
    .expect("create alters table");

    sqlx::query(
        r#"CREATE TABLE uploads (
            id TEXT PRIMARY KEY,
            stored_file_id TEXT NOT NULL,
            stored_name TEXT NOT NULL,
            uploaded_by TEXT NOT NULL,
            created_at TEXT NOT NULL
        )"#,
    )
    .execute(&pool)
    .await
    .expect("create uploads table");

    sqlx::query(
        r#"CREATE TABLE relationships (
            id TEXT PRIMARY KEY,
            type TEXT NOT NULL,
            side_a_user_id TEXT,
            side_a_alter_id TEXT,
            side_b_user_id TEXT,
            side_b_alter_id TEXT,
            past_life INTEGER NOT NULL,
            created_by TEXT,
            created_at TEXT NOT NULL
        )"#,
    )
    .execute(&pool)
    .await
    .expect("create relationships table");

    let log_dir = std::env::temp_dir().join("didhub_test_logs");
    std::fs::create_dir_all(&log_dir).expect("create log dir");
    let log = LogToolClient::new(log_dir.to_str().unwrap());

    // Insert two users: one system user and one non-system user
    let system_id = "00000000-0000-0000-0000-0000000000aa";
    let nonsys_id = "00000000-0000-0000-0000-0000000000bb";
    // insert system user via generated helper
    let mut insert_conn = pool.acquire().await.expect("acquire");
    let system_uuid = uuid::Uuid::parse_str(system_id).unwrap();
    let system_row = didhub_db::generated::users::UsersRow {
        id: system_uuid,
        username: "systemuser".to_string(),
        about_me: None,
        password_hash: "x".to_string(),
        avatar: None,
        is_system: 1,
        is_approved: 1,
        must_change_password: 0,
        is_active: 1,
        email_verified: 0,
        last_login_at: None,
        display_name: None,
        created_at: "now".to_string(),
        updated_at: "now".to_string(),
        is_admin: 0,
        roles: "[]".to_string(),
        settings: "{}".to_string(),
    };
    didhub_db::generated::users::insert_user(&mut *insert_conn, &system_row)
        .await
        .expect("insert system user");

    // insert non-system user via generated helper
    let mut insert_conn = pool.acquire().await.expect("acquire");
    let nonsys_uuid = uuid::Uuid::parse_str(nonsys_id).unwrap();
    let nonsys_row = didhub_db::generated::users::UsersRow {
        id: nonsys_uuid,
        username: "nonsysuser".to_string(),
        about_me: None,
        password_hash: "x".to_string(),
        avatar: None,
        is_system: 0,
        is_approved: 1,
        must_change_password: 0,
        is_active: 1,
        email_verified: 0,
        last_login_at: None,
        display_name: None,
        created_at: "now".to_string(),
        updated_at: "now".to_string(),
        is_admin: 0,
        roles: "[]".to_string(),
        settings: "{}".to_string(),
    };
    didhub_db::generated::users::insert_user(&mut *insert_conn, &nonsys_row)
        .await
        .expect("insert nonsys user");

    // 1) Non-system user (without admin) should be rejected when creating an alter
    let nonsys_uuid = Uuid::parse_str(nonsys_id).unwrap();
    let nonsys_auth = std::sync::Arc::from(Box::new(TestAuthenticator::new_with(
        vec!["user".to_string()],
        Some(nonsys_uuid),
    )) as Box<dyn didhub_auth::AuthenticatorTrait>);
    let state_nonsys = AppState::new(
        pool.clone(),
        log.clone(),
        nonsys_auth,
        didhub_job_queue::JobQueueClient::new(),
        didhub_updates::UpdateCoordinator::new(),
    );
    let arc_state_nonsys = Arc::new(state_nonsys);

    let body = serde_json::json!({ "name": "ShouldFail" });
    let res = alters::create_alter(
        axum::Extension(arc_state_nonsys.clone()),
        auth_headers(),
        Some(axum::Json(body)),
    )
    .await;
    assert!(
        res.is_err(),
        "non-system user should be rejected creating alter"
    );

    // 2) Admin attempting to create an alter for a non-system user should be rejected
    let admin_auth =
        std::sync::Arc::from(Box::new(TestAuthenticator::new_with_scopes(
            vec!["admin".to_string()],
        )) as Box<dyn didhub_auth::AuthenticatorTrait>);
    let state_admin = AppState::new(
        pool.clone(),
        log.clone(),
        admin_auth,
        didhub_job_queue::JobQueueClient::new(),
        didhub_updates::UpdateCoordinator::new(),
    );
    let arc_state_admin = Arc::new(state_admin);
    let body_admin = serde_json::json!({ "user_id": nonsys_id, "name": "AdminShouldFail" });
    let res_admin = alters::create_alter(
        axum::Extension(arc_state_admin.clone()),
        auth_headers(),
        Some(axum::Json(body_admin)),
    )
    .await;
    assert!(
        res_admin.is_err(),
        "admin should be rejected creating alter for non-system user per new policy"
    );

    // 3) Admin creating an alter for a system user should succeed
    let body_admin_ok = serde_json::json!({ "user_id": system_id, "name": "AdminOk" });
    let res_admin_ok = alters::create_alter(
        axum::Extension(arc_state_admin.clone()),
        auth_headers(),
        Some(axum::Json(body_admin_ok)),
    )
    .await
    .expect("admin create system user alter");
    let created = res_admin_ok.0;
    let _id = created
        .get("id")
        .and_then(|v| v.as_str())
        .expect("id")
        .to_string();

    // 4) Non-system user cannot create uploads
    let body_up = serde_json::json!({ "stored_file_id": "00000000-0000-0000-0000-000000000001", "stored_name": "file.txt" });
    let res_up = uploads::create_upload(
        axum::Extension(arc_state_nonsys.clone()),
        auth_headers(),
        Some(axum::Json(body_up)),
    )
    .await;
    assert!(
        res_up.is_err(),
        "non-system user should be rejected creating upload"
    );

    // 5) Admin can create relationship specifying system user ids, but not specifying nonsystem ids
    let rel_payload_fail =
        serde_json::json!({ "relation_type": "friend", "side_a_user_id": nonsys_id });
    let rel_res_fail = relationships::create_relationship(
        axum::Extension(arc_state_admin.clone()),
        auth_headers(),
        Some(axum::Json(rel_payload_fail)),
    )
    .await;
    assert!(
        rel_res_fail.is_err(),
        "admin should be rejected creating relationship referencing nonsystem user"
    );

    let rel_payload_ok =
        serde_json::json!({ "relation_type": "friend", "side_a_user_id": system_id });
    let rel_res_ok = relationships::create_relationship(
        axum::Extension(arc_state_admin.clone()),
        auth_headers(),
        Some(axum::Json(rel_payload_ok)),
    )
    .await
    .expect("admin create relationship with system user");
    let rel_created = rel_res_ok.0;
    assert!(rel_created.get("id").is_some());
}
