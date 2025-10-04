#![cfg(feature = "e2e-tests")]

mod test_utils;

use didhub_server::logging;
use didhub_db::common::CommonOperations;

#[tokio::test]
async fn e2e_alter_owner_behavior_featured() {
    logging::init(false);
    let (app, db) = test_utils::setup_router_db().await;

    // create admin and regular user
    let admin_token = test_utils::register_and_login(&app, "e2e_admin_a", "pw", true, &db).await;
    sqlx::query("UPDATE users SET is_admin = 1 WHERE username = ?").bind("e2e_admin_a").execute(&db.pool).await.expect("make admin");

    let user_token = test_utils::register_and_login(&app, "e2e_user_a", "pw", true, &db).await;

    // admin creates an alter on behalf of the other user
    let payload = serde_json::json!({"name": "e2e alter", "owner_user_id": 2});
    let (status, body) = test_utils::auth_req(&app, axum::http::Method::POST, "/api/alters", &admin_token, Some(payload)).await;
    assert!(status.is_success(), "admin create alter failed: {:?}", (status, body));
    if let Some(owner) = body.get("owner_user_id") { assert_eq!(owner.as_i64().unwrap(), 2); }

    // verify audit entry exists for alter.create
    let audits = db.list_audit(Some("alter.create"), None, None, None, 10, 0).await.expect("list audit");
    assert!(!audits.is_empty(), "no audit rows for alter.create");
    let found = audits.iter().any(|a| a.action == "alter.create" && a.user_id == Some(1));
    assert!(found, "expected audit row for admin alter.create");

    // non-admin attempting to create on behalf of another should be forbidden
    let payload2 = serde_json::json!({"name": "e2e alter 2", "owner_user_id": 1});
    let (status2, _body2) = test_utils::auth_req(&app, axum::http::Method::POST, "/api/alters", &user_token, Some(payload2)).await;
    assert_eq!(status2, axum::http::StatusCode::FORBIDDEN);
}
