use anyhow::Result;
mod test_utils;
use test_utils::{setup_router_db, register_and_login, auth_req};
use didhub_db::users::UserOperations;

#[tokio::test]
async fn me_profile_get_and_update() -> Result<()> {
    let (app, db) = setup_router_db().await;
    // register and approve user
    let token = register_and_login(&app, "profuser", "Th1sIs$tr0ng!Pwd2025", true, &db).await;

    // get profile
    let (status, body) = auth_req(&app, axum::http::Method::GET, "/api/me/profile", &token, None).await;
    assert_eq!(status, axum::http::StatusCode::OK);
    assert_eq!(body["username"].as_str().unwrap(), "profuser");

    // update about_me
    let new_about = serde_json::json!({"about_me": "I like testing"});
    let (status2, body2) = auth_req(&app, axum::http::Method::PUT, "/api/me/profile", &token, Some(new_about)).await;
    assert_eq!(status2, axum::http::StatusCode::OK);
    assert_eq!(body2["about_me"].as_str().unwrap(), "I like testing");

    // clear about_me
    let clear = serde_json::json!({"about_me": ""});
    let (status3, body3) = auth_req(&app, axum::http::Method::PUT, "/api/me/profile", &token, Some(clear)).await;
    assert_eq!(status3, axum::http::StatusCode::OK);
    // Also verify in DB that about_me was cleared (robust check). Accept NULL or empty string.
    let db_user = db.fetch_user_by_username("profuser").await?.unwrap();
    assert!(db_user.about_me.is_none() || db_user.about_me.as_deref() == Some(""));

    Ok(())
}
