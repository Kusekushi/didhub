mod test_utils;
use axum::http::Method;
use didhub_db::users::UserOperations;
use serde_json::json;
use test_utils::*;

#[tokio::test]
async fn owner_can_delete_subsystem() {
    let (app, db) = setup_router_db().await;

    // register owner and approve
    let owner_token = register_and_login(&app, "owner_user", "SecurePass123", true, &db).await;

    // create alter owned by owner (implicit owner from token)
    let create_alter = json!({"name": "OwnerAlter"});
    let (status, body) = auth_req(
        &app,
        Method::POST,
        "/api/alters",
        &owner_token,
        Some(create_alter),
    )
    .await;
    assert!(
        status.is_success(),
        "create alter failed: {:?} - body: {:?}",
        status,
        body
    );
    let alter_id = body["id"].as_str().unwrap().to_string();

    // create subsystem owned by same owner
    let create_ss = json!({"name": "OwnerSS"});
    let (status, body) = auth_req(
        &app,
        Method::POST,
        "/api/subsystems",
        &owner_token,
        Some(create_ss),
    )
    .await;
    assert!(
        status.is_success(),
        "create subsystem failed: {:?} - body: {:?}",
        status,
        body
    );
    let ss_id = body["id"].as_str().unwrap().to_string();

    // assign subsystem to alter
    let payload = serde_json::json!({"subsystem_id": ss_id});
    let (status, _body) = auth_req(
        &app,
        Method::PUT,
        &format!("/api/alters/{}/subsystems", alter_id),
        &owner_token,
        Some(payload),
    )
    .await;
    assert_eq!(status, axum::http::StatusCode::OK);

    // delete subsystem
    let (status, _body) = auth_req(
        &app,
        Method::DELETE,
        &format!("/api/alters/{}/subsystems", alter_id),
        &owner_token,
        None,
    )
    .await;
    assert_eq!(status, axum::http::StatusCode::NO_CONTENT);

    // verify GET returns null
    let (status, body) = auth_req(
        &app,
        Method::GET,
        &format!("/api/alters/{}/subsystems", alter_id),
        &owner_token,
        None,
    )
    .await;
    assert_eq!(status, axum::http::StatusCode::OK);
    assert!(
        body.is_null()
            || body == serde_json::json!({})
            || body == serde_json::json!(null)
            || body == serde_json::json!("")
    );
}

#[tokio::test]
async fn admin_can_delete_subsystem() {
    let (app, db) = setup_router_db().await;

    // register owner and approve
    let _owner_token = register_and_login(&app, "owner2", "SecurePass123", true, &db).await;
    // register admin and approve then set is_admin directly
    let _ = register_and_login(&app, "admin_user", "SecurePass123", true, &db).await;
    // mark admin_user as admin
    sqlx::query("UPDATE users SET is_admin = 1 WHERE username = ?")
        .bind("admin_user")
        .execute(&db.pool)
        .await
        .unwrap();

    // re-login to get updated claims
    let admin_token = login(&app, "admin_user", "SecurePass123").await;

    // create alter for owner2 (admin can create for others by specifying owner_user_id)
    let owner = db.fetch_user_by_username("owner2").await.unwrap().unwrap();
    let owner_id = owner.id;

    let create_alter = json!({"name": "OwnerAlter2", "owner_user_id": owner_id});
    let (status, body) = auth_req(
        &app,
        Method::POST,
        "/api/alters",
        &admin_token,
        Some(create_alter),
    )
    .await;
    assert!(
        status.is_success(),
        "admin create alter failed: {:?} - body: {:?}",
        status,
        body
    );
    let alter_id = body["id"].as_str().unwrap().to_string();

    // create subsystem for owner2
    let create_ss = json!({"name": "OwnerSS2", "owner_user_id": owner_id});
    let (status, body) = auth_req(
        &app,
        Method::POST,
        "/api/subsystems",
        &admin_token,
        Some(create_ss),
    )
    .await;
    assert!(
        status.is_success(),
        "admin create subsystem failed: {:?} - body: {:?}",
        status,
        body
    );
    let ss_id = body["id"].as_str().unwrap().to_string();

    // assign subsystem to alter (as admin)
    let payload = serde_json::json!({"subsystem_id": ss_id});
    let (status, _body) = auth_req(
        &app,
        Method::PUT,
        &format!("/api/alters/{}/subsystems", alter_id),
        &admin_token,
        Some(payload),
    )
    .await;
    assert_eq!(status, axum::http::StatusCode::OK);

    // admin deletes subsystem
    let (status, _body) = auth_req(
        &app,
        Method::DELETE,
        &format!("/api/alters/{}/subsystems", alter_id),
        &admin_token,
        None,
    )
    .await;
    assert_eq!(status, axum::http::StatusCode::NO_CONTENT);
}

#[tokio::test]
async fn non_owner_forbidden() {
    let (app, db) = setup_router_db().await;

    // register owner and another user
    let owner_token = register_and_login(&app, "owner3", "SecurePass123", true, &db).await;
    let other_token = register_and_login(&app, "other_user", "SecurePass123", true, &db).await;

    // create alter owned by owner3
    let create_alter = json!({"name": "OwnerAlter3"});
    let (status, body) = auth_req(
        &app,
        Method::POST,
        "/api/alters",
        &owner_token,
        Some(create_alter),
    )
    .await;
    assert!(
        status.is_success(),
        "create alter failed: {:?} - body: {:?}",
        status,
        body
    );
    let alter_id = body["id"].as_str().unwrap().to_string();

    // create subsystem owned by owner3
    let create_ss = json!({"name": "OwnerSS3"});
    let (status, body) = auth_req(
        &app,
        Method::POST,
        "/api/subsystems",
        &owner_token,
        Some(create_ss),
    )
    .await;
    assert!(
        status.is_success(),
        "create subsystem failed: {:?} - body: {:?}",
        status,
        body
    );
    let ss_id = body["id"].as_str().unwrap().to_string();

    // assign subsystem to alter
    let payload = serde_json::json!({"subsystem_id": ss_id});
    let (status, _body) = auth_req(
        &app,
        Method::PUT,
        &format!("/api/alters/{}/subsystems", alter_id),
        &owner_token,
        Some(payload),
    )
    .await;
    assert_eq!(status, axum::http::StatusCode::OK);

    // other_user tries to delete and should be forbidden
    let (status, _body) = auth_req(
        &app,
        Method::DELETE,
        &format!("/api/alters/{}/subsystems", alter_id),
        &other_token,
        None,
    )
    .await;
    assert_eq!(status, axum::http::StatusCode::FORBIDDEN);
}
