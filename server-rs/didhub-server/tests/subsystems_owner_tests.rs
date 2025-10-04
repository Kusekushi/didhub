mod test_utils;
use didhub_db::users::UserOperations;
use serde_json::json;
use test_utils::*;

#[tokio::test]
async fn admin_can_create_subsystem_for_other_user() {
    let (app, db) = setup_router_db().await;
    let _ = register_and_login(&app, "admin_s", "pw", true, &db).await;
    let _ = register_and_login(&app, "target_s", "pw", true, &db).await;
    let au = db.fetch_user_by_username("admin_s").await.unwrap().unwrap();
    let mut f = didhub_server::db::UpdateUserFields::default();
    f.is_admin = Some(true);
    f.is_approved = Some(true);
    db.update_user(au.id, f).await.unwrap();
    let token_admin = login(&app, "admin_s", "pw").await;
    let target = db
        .fetch_user_by_username("target_s")
        .await
        .unwrap()
        .unwrap();

    let (st, body) = auth_req(
        &app,
        axum::http::Method::POST,
        "/api/subsystems",
        &token_admin,
        Some(json!({"name":"AdminSS","owner_user_id": target.id})),
    )
    .await;
    assert_eq!(
        st,
        axum::http::StatusCode::CREATED,
        "unexpected status: {:?} - body: {:?}",
        st,
        body
    );
    assert_eq!(body["owner_user_id"].as_i64().unwrap(), target.id);
}

#[tokio::test]
async fn nonadmin_cannot_create_subsystem_for_other_but_can_create_for_self() {
    let (app, db) = setup_router_db().await;
    let token_a = register_and_login(&app, "user_sa", "pw", true, &db).await;
    let _ = register_and_login(&app, "user_sb", "pw", true, &db).await;
    let user_a = db.fetch_user_by_username("user_sa").await.unwrap().unwrap();
    let user_b = db.fetch_user_by_username("user_sb").await.unwrap().unwrap();

    let (st_forb, _body) = auth_req(
        &app,
        axum::http::Method::POST,
        "/api/subsystems",
        &token_a,
        Some(json!({"name":"BadSS","owner_user_id": user_b.id})),
    )
    .await;
    assert_eq!(st_forb, axum::http::StatusCode::FORBIDDEN);

    let (st_ok, body_ok) = auth_req(
        &app,
        axum::http::Method::POST,
        "/api/subsystems",
        &token_a,
        Some(json!({"name":"SelfSS"})),
    )
    .await;
    assert_eq!(st_ok, axum::http::StatusCode::CREATED);
    assert_eq!(body_ok["owner_user_id"].as_i64().unwrap(), user_a.id);

    let (st_ok2, body_ok2) = auth_req(
        &app,
        axum::http::Method::POST,
        "/api/subsystems",
        &token_a,
        Some(json!({"name":"SelfSS2","owner_user_id": user_a.id})),
    )
    .await;
    assert_eq!(st_ok2, axum::http::StatusCode::CREATED);
    assert_eq!(body_ok2["owner_user_id"].as_i64().unwrap(), user_a.id);
}
