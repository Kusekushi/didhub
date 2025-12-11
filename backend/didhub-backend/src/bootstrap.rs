use didhub_backend::state::AppState;
use didhub_db::generated::users as db_users;

/// Provision an admin user from environment variables if no admin exists.
/// Env vars: DIDHUB_ADMIN_USERNAME, DIDHUB_ADMIN_PASSWORD, DIDHUB_ADMIN_DISPLAY_NAME (optional)
pub async fn maybe_provision_admin(state: &AppState) -> anyhow::Result<()> {
    // Read env vars
    let username = match std::env::var("DIDHUB_ADMIN_USERNAME") {
        Ok(u) if !u.is_empty() => u,
        _ => return Ok(()),
    };
    let password = match std::env::var("DIDHUB_ADMIN_PASSWORD") {
        Ok(p) if !p.is_empty() => p,
        _ => {
            tracing::warn!("DIDHUB_ADMIN_USERNAME set but DIDHUB_ADMIN_PASSWORD missing; skipping admin provisioning");
            return Ok(());
        }
    };
    let display_name = std::env::var("DIDHUB_ADMIN_DISPLAY_NAME").ok();

    // Check if any admin exists (user with 'admin' role)
    let mut conn = state.db_pool.acquire().await?;
    let existing: Option<i64> =
        sqlx::query_scalar("SELECT 1 FROM users WHERE roles LIKE '%\"admin\"%' LIMIT 1")
            .fetch_optional(&mut *conn)
            .await?;
    if existing.is_some() {
        tracing::info!(username=%username, "admin already exists; skipping provisioning");
        return Ok(());
    }

    // Hash password using didhub_auth
    let password_hash =
        didhub_auth::hash_password(&password).map_err(|e| anyhow::anyhow!("{}", e))?;

    let now = chrono::Utc::now().to_rfc3339();
    let new_row = db_users::UsersRow {
        id: sqlx::types::Uuid::new_v4(),
        username: username.clone(),
        about_me: None,
        password_hash,
        avatar: None,
        must_change_password: 1,
        last_login_at: None,
        display_name,
        created_at: now.clone(),
        updated_at: now,
        roles: "[\"admin\",\"system\",\"user\"]".to_string(),
        settings: "{}".to_string(),
    };

    db_users::insert_user(&mut *conn, &new_row).await?;
    tracing::info!(username=%username, "provisioned initial admin user");
    Ok(())
}
