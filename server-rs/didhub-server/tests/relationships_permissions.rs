mod test_utils;
use test_utils::{setup_router_db, register_and_login, auth_req};
use didhub_db::users::UserOperations;

#[tokio::test]
async fn relationships_permission_matrix() {
    let (app, db) = setup_router_db().await;

    // Create users and obtain tokens
    let alice_token = register_and_login(&app, "alice", "SecurePass123", true, &db).await;
    let bob_token = register_and_login(&app, "bob", "SecurePass123", true, &db).await;
    let charlie_token = register_and_login(&app, "charlie", "SecurePass123", true, &db).await;

    // fetch their ids from DB
    let alice = db.fetch_user_by_username("alice").await.unwrap().unwrap();
    let bob = db.fetch_user_by_username("bob").await.unwrap().unwrap();
    let charlie = db.fetch_user_by_username("charlie").await.unwrap().unwrap();

    // Bob creates an alter he owns
    let create_alter = serde_json::json!({"name":"Bob's Alter","owner_user_id": bob.id});
    let (status, body) = auth_req(&app, axum::http::Method::POST, "/api/alters", &bob_token, Some(create_alter)).await;
    assert_eq!(status, axum::http::StatusCode::OK);
    let alter_id = body["id"].as_str().unwrap().to_string();

    // 1) alice (non-participant) cannot create relationship between bob and charlie (user-user)
    let payload = serde_json::json!({"a": format!("U:{}", bob.id), "b": format!("U:{}", charlie.id), "relationship_type": "spouse"});
    let (status, _body) = auth_req(&app, axum::http::Method::POST, "/api/relationships", &alice_token, Some(payload)).await;
    assert_eq!(status, axum::http::StatusCode::FORBIDDEN);

    // 2) bob (participant) can create relationship between bob and charlie
    let payload = serde_json::json!({"a": format!("U:{}", bob.id), "b": format!("U:{}", charlie.id), "relationship_type": "spouse"});
    let (status, body) = auth_req(&app, axum::http::Method::POST, "/api/relationships", &bob_token, Some(payload)).await;
    assert_eq!(status, axum::http::StatusCode::OK);
    let rel_id = body["id"].as_str().unwrap().to_string();

    // 3) alice can create relationship involving herself and bob
    let payload = serde_json::json!({"a": format!("U:{}", alice.id), "b": format!("U:{}", bob.id), "relationship_type": "parent"});
    let (status, _body) = auth_req(&app, axum::http::Method::POST, "/api/relationships", &alice_token, Some(payload)).await;
    assert_eq!(status, axum::http::StatusCode::OK);

    // 4) charlie (non-owner, non-participant) cannot delete relationship between bob and his alter unless participant
    // create a relation between bob (user) and alter
    let payload = serde_json::json!({"a": format!("U:{}", bob.id), "b": format!("A:{}", alter_id), "relationship_type": "spouse"});
    let (status, body) = auth_req(&app, axum::http::Method::POST, "/api/relationships", &bob_token, Some(payload)).await;
    assert_eq!(status, axum::http::StatusCode::OK);
    let rel2_id = body["id"].as_str().unwrap().to_string();

    let (status, _body) = auth_req(&app, axum::http::Method::DELETE, &format!("/api/relationships/{}", rel2_id), &charlie_token, None).await;
    assert_eq!(status, axum::http::StatusCode::FORBIDDEN);

    // 5) bob (owner) can delete relationship involving his alter
    let (status, _body) = auth_req(&app, axum::http::Method::DELETE, &format!("/api/relationships/{}", rel2_id), &bob_token, None).await;
    assert_eq!(status, axum::http::StatusCode::NO_CONTENT);
}
