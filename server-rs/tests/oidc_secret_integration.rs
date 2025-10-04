use didhub_server::routes::auth::oidc::{get_secret, update_secret, UpdateSecretBody};
use didhub_server::db::{Db, DbBackend};
use didhub_server::auth::CurrentUser;
use tempfile::NamedTempFile;

// Note: this test creates an in-memory sqlite DB and uses the Db helpers to set/get settings.
#[tokio::test]
async fn get_returns_masked_and_post_updates() -> Result<(), Box<dyn std::error::Error>> {
    // initialize an in-memory DB pool
    // use a temporary file so migrations run and drivers are available
    let tmp = NamedTempFile::new()?;
    let path = tmp.path().to_string_lossy().to_string();
    if std::path::Path::new(&path).exists() { let _ = std::fs::remove_file(&path); }
    if let Some(p) = std::path::Path::new(&path).parent() { std::fs::create_dir_all(p).ok(); }
    let _ = std::fs::OpenOptions::new().create(true).write(true).open(&path).expect("create sqlite file");
    sqlx::any::install_default_drivers();
    if std::path::Path::new(&path).exists() { let _ = std::fs::remove_file(&path); }
    if let Some(p) = std::path::Path::new(&path).parent() { std::fs::create_dir_all(p).ok(); }
    let _ = std::fs::OpenOptions::new().create(true).write(true).open(&path).expect("create sqlite file");
    sqlx::any::install_default_drivers();
    let db = Db::connect_with_file(&path).await?;

    // insert initial client id and secret
    db.upsert_setting("oidc_provider_client_id_google", &serde_json::to_string("myclientid12345")?).await?;
    db.upsert_setting("oidc_provider_client_secret_google", &serde_json::to_string("supersecret")?).await?;
    db.upsert_setting("oidc_provider_enabled_google", &serde_json::to_string(&true)?).await?;

    // Build an admin user
    let admin = CurrentUser { id: 1, username: "admin".into(), avatar: None, is_admin: true, is_system: true, is_approved: true, must_change_password: false };

    // Call get_secret handler
    let res = get_secret(axum::extract::Path("google".to_string()), axum::Extension(db.clone()), axum::Extension(admin.clone())).await;
    match res {
        Ok(axum::Json(view)) => {
            // client_id should be masked (contain ...)
            assert!(view.client_id.contains("..."), "client_id should be masked");
            assert!(view.has_client_secret, "has_client_secret should be true");
        }
        Err(e) => panic!("get_secret failed: {:?}", e),
    }

    // Now POST update without editing client_id (send masked back) should not overwrite
    let body = UpdateSecretBody { client_id: None, client_secret: Some("newsupersecret".into()), enabled: Some(true) };
    let post_res = update_secret(axum::extract::Path("google".to_string()), axum::Extension(db.clone()), axum::Extension(admin.clone()), axum::Json(body)).await;
    match post_res {
        Ok(axum::Json(view)) => {
            // still masked in response, and secret exists
            assert!(view.client_id.contains("..."));
            assert!(view.has_client_secret);
        }
        Err(e) => panic!("update_secret failed: {:?}", e),
    }

    // Verify underlying DB secret updated
    let sec = db.get_setting("oidc_provider_client_secret_google").await?;
    assert!(sec.is_some());
    let val = sec.unwrap();
    let parsed: serde_json::Value = serde_json::from_str(&val.value)?;
    assert_eq!(parsed.as_str().unwrap(), "newsupersecret");

    Ok(())
}
