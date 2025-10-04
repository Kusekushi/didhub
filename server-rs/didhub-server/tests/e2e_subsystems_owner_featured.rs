#![cfg(feature = "e2e-tests")]

mod test_utils;

use didhub_server::logging;

// Feature-gated 'e2e' test that runs against an in-process router using the
// shared test helpers. This avoids the need to bind sockets in CI/Windows
// environments while still exercising the full HTTP stack via oneshot calls.
#[tokio::test]
async fn e2e_subsystem_owner_behavior_featured() {
    logging::init(false);
    // Reuse shared setup helper which creates a temp sqlite DB, runs migrations
    // and returns an `axum::Router` and `Db` instance.
    let (app, db) = test_utils::setup_router_db().await;

    // Register and login a user using the helper which performs CSRF-aware
    // oneshot requests against the in-process router.
    let token = test_utils::register_and_login(&app, "e2e_a", "pw", true, &db).await;
    assert!(!token.is_empty());
}
