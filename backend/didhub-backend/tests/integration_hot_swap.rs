use std::collections::HashMap;
use std::sync::Arc;

use didhub_db::{create_pool, DbConnectionConfig};
use didhub_log_client::LogToolClient;

use didhub_auth::TestAuthenticator;
use didhub_backend::state::AppState;

#[tokio::test]
async fn hot_swap_log_client_and_authenticator() {
    // DB pool (not used heavily here but required by AppState)
    let config = DbConnectionConfig::new("sqlite::memory:");
    let pool = create_pool(&config).await.expect("create pool");

    // Create first log client (dir A) and authenticator A (no admin scope)
    let dir_a = tempfile::tempdir().expect("tempdir A");
    let log_a = LogToolClient::new(dir_a.path().to_str().unwrap());

    let auth_a = Arc::from(
        Box::new(TestAuthenticator::new_with_scopes(vec!["user".to_string()]))
            as Box<dyn didhub_auth::AuthenticatorTrait>,
    );

    let state = AppState::new(
        pool.clone(),
        log_a,
        auth_a,
        didhub_job_queue::JobQueueClient::new(),
        didhub_updates::UpdateCoordinator::new(),
    );
    let arc_state = Arc::new(state);

    // Write an audit entry via current log client (A)
    arc_state
        .audit_request(
            "GET",
            "/test/audit/a",
            &HashMap::new(),
            &HashMap::new(),
            &serde_json::json!({}),
        )
        .await
        .expect("audit a");

    // Capture the current client instance so we can later verify swap occurred.
    let client_a = arc_state.log_client();

    // Swap to a new log client (dir B)
    let dir_b = tempfile::tempdir().expect("tempdir B");
    let log_b = LogToolClient::new(dir_b.path().to_str().unwrap());
    let _old = arc_state.swap_log_client(log_b);
    // old should be an Arc<LogToolClient> (previous client)

    // After swap, audit to new log client
    arc_state
        .audit_request(
            "POST",
            "/test/audit/b",
            &HashMap::new(),
            &HashMap::new(),
            &serde_json::json!({ "k": "v" }),
        )
        .await
        .expect("audit b");

    // Verify the currently visible client instance is different to the previous one.
    let client_b = arc_state.log_client();
    assert!(
        !std::sync::Arc::ptr_eq(&client_a, &client_b),
        "expected log client to be swapped"
    );

    // Authenticator: current one does NOT have admin scope
    let auth_header: Option<&str> = Some("token");
    let auth_res = arc_state.authenticator().authenticate(auth_header).await;
    assert!(auth_res.is_ok(), "authenticate should succeed");
    let auth = auth_res.unwrap();
    assert!(
        !auth.scopes.iter().any(|s| s == "admin"),
        "auth A should not be admin"
    );

    // Swap authenticator to one with admin scope
    let auth_b = Arc::from(Box::new(TestAuthenticator::new_with_scopes(
        vec!["admin".to_string()],
    )) as Box<dyn didhub_auth::AuthenticatorTrait>);
    let _old_auth = arc_state.swap_authenticator(auth_b);

    // Now authentication should provide admin scope
    let auth_res2 = arc_state.authenticator().authenticate(auth_header).await;
    assert!(auth_res2.is_ok(), "authenticate should succeed after swap");
    let auth2 = auth_res2.unwrap();
    assert!(
        auth2.scopes.iter().any(|s| s == "admin"),
        "auth B should be admin"
    );
}
