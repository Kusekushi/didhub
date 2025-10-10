mod test_utils;
use axum::http::StatusCode;
use didhub_db::users::UserOperations;
use didhub_db::UpdateUserFields;
use serde_json::json;
use test_utils::*;

#[tokio::test]
async fn admin_can_create_group_for_other_user() {
    let (app, db) = setup_router_db().await;

    // register admin and target user
    let _tok_admin = register_and_login(&app, "admin_u", "SecurePass123", true, &db).await;
    let _tok_target = register_and_login(&app, "target_u", "SecurePass123", true, &db).await;

    // promote admin
    let au = db.fetch_user_by_username("admin_u").await.unwrap().unwrap();
    let mut f = UpdateUserFields::default();
    f.is_admin = Some(true);
    f.is_approved = Some(true);
    db.update_user(&au.id, f).await.unwrap();

    // re-login to obtain admin token (reuse login helper)
    let token_admin = login(&app, "admin_u", "SecurePass123").await;

    let target = db
        .fetch_user_by_username("target_u")
        .await
        .unwrap()
        .unwrap();

    // admin creates group for target
    let (st, body) = auth_req(
        &app,
        axum::http::Method::POST,
        "/api/groups",
        &token_admin,
        Some(json!({"name":"AdminGroup","owner_user_id": target.id})),
    )
    .await;
    assert_eq!(
        st,
        StatusCode::CREATED,
        "unexpected status: {:?} - body: {:?}",
        st,
        body
    );
    assert_eq!(body["owner_user_id"].as_str().unwrap(), target.id);
}

#[tokio::test]
async fn nonadmin_cannot_create_for_other_but_can_create_for_self() {
    let (app, db) = setup_router_db().await;
    // create two users
    let token_a = register_and_login(&app, "user_a", "SecurePass123", true, &db).await;
    let _token_b = register_and_login(&app, "user_b", "SecurePass123", true, &db).await;
    let user_a = db.fetch_user_by_username("user_a").await.unwrap().unwrap();
    let user_b = db.fetch_user_by_username("user_b").await.unwrap().unwrap();

    // attempt to create group for other user - should be forbidden
    let (st_forb, body_forb) = auth_req(
        &app,
        axum::http::Method::POST,
        "/api/groups",
        &token_a,
        Some(json!({"name":"BadGroup","owner_user_id": user_b.id})),
    )
    .await;
    if st_forb != StatusCode::FORBIDDEN {
        panic!(
            "expected forbidden, got {:?} - body: {:?}",
            st_forb, body_forb
        );
    }

    // create group for self (no owner provided)
    let (st_ok, body_ok) = auth_req(
        &app,
        axum::http::Method::POST,
        "/api/groups",
        &token_a,
        Some(json!({"name":"SelfGroup"})),
    )
    .await;
    assert_eq!(
        st_ok,
        StatusCode::CREATED,
        "unexpected status: {:?} - body: {:?}",
        st_ok,
        body_ok
    );
    assert_eq!(body_ok["owner_user_id"].as_str().unwrap(), user_a.id);

    // create group with explicit owner = self
    let (st_ok2, body_ok2) = auth_req(
        &app,
        axum::http::Method::POST,
        "/api/groups",
        &token_a,
        Some(json!({"name":"SelfGroup2","owner_user_id": user_a.id})),
    )
    .await;
    assert_eq!(
        st_ok2,
        StatusCode::CREATED,
        "unexpected status: {:?} - body: {:?}",
        st_ok2,
        body_ok2
    );
    assert_eq!(body_ok2["owner_user_id"].as_str().unwrap(), user_a.id);
}
