#![cfg(feature = "e2e-tests")]

mod test_utils;

use didhub_server::logging;
use didhub_db::common::CommonOperations;

#[tokio::test]
async fn e2e_group_owner_behavior_featured() {
    logging::init(false);
    let (app, db) = test_utils::setup_router_db().await;

    // create admin and regular user
    let admin_token = test_utils::register_and_login(&app, "e2e_admin_g", "pw", true, &db).await;
    // make admin
    sqlx::query("UPDATE users SET is_admin = 1 WHERE username = ?").bind("e2e_admin_g").execute(&db.pool).await.expect("make admin");

    let user_token = test_utils::register_and_login(&app, "e2e_user_g", "pw", true, &db).await;

    // admin creates a group on behalf of the other user
    let payload = serde_json::json!({"name": "e2e group", "owner_user_id": 2});
    let (status, body) = test_utils::auth_req(&app, axum::http::Method::POST, "/api/groups", &admin_token, Some(payload)).await;
    assert!(status.is_success(), "admin create failed: {:?}", (status, body));
    // verify returned owner_user_id matches requested
    if let Some(owner) = body.get("owner_user_id") { assert_eq!(owner.as_i64().unwrap(), 2); }

    // verify audit entry exists for group.create
    let audits = db.list_audit(Some("group.create"), None, None, None, 10, 0).await.expect("list audit");
    assert!(!audits.is_empty(), "no audit rows for group.create");
    let found = audits.iter().any(|a| a.action == "group.create" && a.user_id == Some(1));
    assert!(found, "expected audit row for admin group.create");

    // non-admin attempting to create on behalf of another should be forbidden
    let payload2 = serde_json::json!({"name": "e2e group 2", "owner_user_id": 1});
    let (status2, _body2) = test_utils::auth_req(&app, axum::http::Method::POST, "/api/groups", &user_token, Some(payload2)).await;
    assert_eq!(status2, axum::http::StatusCode::FORBIDDEN);
}
