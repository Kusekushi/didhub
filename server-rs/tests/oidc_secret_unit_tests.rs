#[cfg(test)]
mod tests {
    use super::*;
    use didhub_middleware::CurrentUser;
    use didhub_db::Db;
    use didhub_db::DbBackend;
    use crate::routes_oidc::{get_secret, update_secret, UpdateSecretBody};
    use tempfile::NamedTempFile;

    #[tokio::test]
    async fn lib_get_masked_and_post_updates() -> Result<(), Box<dyn std::error::Error>> {
        let tmp = NamedTempFile::new()?;
        let path = tmp.path().to_string_lossy().to_string();
        let db = Db::connect_with_file(&path).await?;

        // insert settings
        db.upsert_setting(
            "oidc_provider_client_id_google",
            &serde_json::to_string("myclientid12345")?,
        )
        .await?;
        db.upsert_setting(
            "oidc_provider_client_secret_google",
            &serde_json::to_string("supersecret")?,
        )
        .await?;
        db.upsert_setting(
            "oidc_provider_enabled_google",
            &serde_json::to_string(&true)?,
        )
        .await?;

        let admin = CurrentUser {
            id: 1,
            username: "admin".into(),
            avatar: None,
            is_admin: true,
            is_system: true,
            is_approved: true,
            must_change_password: false,
        };

        let res = get_secret(
            axum::extract::Path("google".to_string()),
            axum::Extension(db.clone()),
            axum::Extension(admin.clone()),
        )
        .await?;
        let axum::Json(view) = res;
        assert!(view.client_id.contains("..."));
        assert!(view.has_client_secret);

        let body = UpdateSecretBody {
            client_id: None,
            client_secret: Some("newsupersecret".into()),
            enabled: Some(true),
        };
        let post = update_secret(
            axum::extract::Path("google".to_string()),
            axum::Extension(db.clone()),
            axum::Extension(admin.clone()),
            axum::Json(body),
        )
        .await?;
        let axum::Json(pview) = post;
        assert!(pview.client_id.contains("..."));
        assert!(pview.has_client_secret);

        let sec = db.get_setting("oidc_provider_client_secret_google").await?;
        assert!(sec.is_some());
        let parsed: serde_json::Value = serde_json::from_str(&sec.unwrap().value)?;
        assert_eq!(parsed.as_str().unwrap(), "newsupersecret");

        Ok(())
    }
}
