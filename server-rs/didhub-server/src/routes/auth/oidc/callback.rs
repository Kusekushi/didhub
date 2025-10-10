use argon2::password_hash::{rand_core::OsRng, SaltString};
use argon2::{Argon2, PasswordHasher};
use axum::extract::{Path, Query};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::{Extension, Json};
use didhub_config::AppConfig;
use didhub_db::users::UserOperations;
use didhub_db::{audit, Db, NewUser};
use didhub_error::AppError;
use didhub_metrics::OIDC_LOGIN_TOTAL;
use didhub_oidc as oidc;
use openidconnect::reqwest::ClientBuilder;
use openidconnect::{AuthorizationCode, OAuth2TokenResponse, PkceCodeVerifier, TokenResponse};

use super::{build_oidc_client, get_global_oidc_enabled, get_provider_config, issue_jwt};

pub async fn callback(
    Path(id): Path<String>,
    Query(params): Query<std::collections::HashMap<String, String>>,
    Extension(db): Extension<Db>,
    Extension(ostate): Extension<oidc::OidcState>,
    Extension(settings): Extension<oidc::ProviderSettings>,
    Extension(cfg): Extension<AppConfig>,
) -> Result<impl IntoResponse, AppError> {
    let globally_enabled = get_global_oidc_enabled(&db).await?;
    if !globally_enabled {
        return Err(AppError::Forbidden);
    }

    let state = params
        .get("state")
        .cloned()
        .ok_or_else(|| AppError::BadRequest("missing state".into()))?;
    let code = params
        .get("code")
        .cloned()
        .ok_or_else(|| AppError::BadRequest("missing code".into()))?;

    let flow = ostate
        .take_flow(&state)
        .await
        .ok_or_else(|| AppError::BadRequest("invalid state".into()))?;
    if flow.provider != id {
        return Err(AppError::BadRequest("provider mismatch".into()));
    }

    let config = get_provider_config(&db, &id).await?;
    if !config.enabled {
        return Err(AppError::Forbidden);
    }

    let prov = settings.get(&id).ok_or(AppError::NotFound)?.clone();
    if config
        .client_id
        .as_ref()
        .unwrap_or(&prov.client_id)
        .starts_with("CHANGE_ME_")
    {
        return Ok((
            StatusCode::NOT_IMPLEMENTED,
            Json(serde_json::json!({
                "status": "provider_not_configured",
                "provider": id,
                "detail": "Configure client_id/client_secret to enable token exchange"
            })),
        ));
    }

    let http_client = ClientBuilder::new()
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|_| AppError::Internal)?;

    let client = build_oidc_client(
        &id,
        &prov.issuer,
        &prov.client_id,
        prov.client_secret.as_deref(),
        &settings,
        &db,
        &http_client,
    )
    .await?;

    let pkce_verifier = PkceCodeVerifier::new(flow.code_verifier.clone());
    let token_req = match client.exchange_code(AuthorizationCode::new(code)) {
        Ok(req) => req,
        Err(_) => return Err(AppError::BadRequest("invalid authorization code".into())),
    };

    let token_response = match token_req
        .set_pkce_verifier(pkce_verifier)
        .request_async(&http_client)
        .await
    {
        Ok(response) => response,
        Err(_) => return Err(AppError::BadRequest("token exchange failed".into())),
    };

    let id_token = token_response
        .id_token()
        .ok_or_else(|| AppError::BadRequest("missing id_token".into()))?;
    let id_token_verifier = client.id_token_verifier();
    let nonce = openidconnect::Nonce::new(flow.nonce.clone());
    let claims = id_token
        .claims(&id_token_verifier, &nonce)
        .map_err(|_| AppError::BadRequest("id_token verification failed".into()))?;

    if let Some(expected_hash) = claims.access_token_hash() {
        if let (Ok(alg), Ok(signing_key)) = (
            id_token.signing_alg(),
            id_token.signing_key(&id_token_verifier),
        ) {
            if let Ok(actual_hash) = openidconnect::AccessTokenHash::from_token(
                token_response.access_token(),
                alg,
                signing_key,
            ) {
                if &actual_hash != expected_hash {
                    return Err(AppError::BadRequest("access_token hash mismatch".into()));
                }
            }
        }
    }

    let subject = claims.subject().as_str().to_string();
    let email = claims.email().map(|e| e.as_str().to_string());
    let name = claims
        .name()
        .and_then(|n| n.get(None).map(|s| s.to_string()));

    if let Ok(Some(existing)) = db.fetch_user_by_oidc(&id, &subject).await {
        let token = issue_jwt(&cfg, &existing.username)?;
        audit::record_with_metadata(
            &db,
            Some(existing.id.as_str()),
            "oidc.login",
            Some("oidc_provider"),
            Some(&id),
            serde_json::json!({"sub": subject, "existing": true}),
        )
        .await;
        OIDC_LOGIN_TOTAL
            .with_label_values(&[id.as_str(), "existing"])
            .inc();
        return Ok((
            StatusCode::OK,
            Json(serde_json::json!({
                "status": "login_success",
                "provider": id,
                "sub": subject,
                "username": existing.username,
                "redirect": flow.redirect,
                "token": token
            })),
        ));
    }

    if let Some(em) = email.as_ref() {
        if let Ok(Some(existing_by_username)) = db.fetch_user_by_username(em).await {
            let _ = db
                .link_oidc_identity(&id, &subject, &existing_by_username.id)
                .await;
            let token = issue_jwt(&cfg, &existing_by_username.username)?;
            audit::record_with_metadata(
                &db,
                Some(existing_by_username.id.as_str()),
                "oidc.login.link",
                Some("oidc_provider"),
                Some(&id),
                serde_json::json!({"sub": subject, "linked_via": "email"}),
            )
            .await;
            OIDC_LOGIN_TOTAL
                .with_label_values(&[id.as_str(), "linked"])
                .inc();
            return Ok((
                StatusCode::OK,
                Json(serde_json::json!({
                    "status": "login_success_linked",
                    "provider": id,
                    "sub": subject,
                    "username": existing_by_username.username,
                    "redirect": flow.redirect,
                    "token": token
                })),
            ));
        }
    }

    let base_username = email
        .as_ref()
        .or(name.as_ref())
        .map(|s| s.as_str().to_lowercase())
        .unwrap_or_else(|| format!("{}:{}", id, subject));

    let salt = SaltString::generate(&mut OsRng);
    let argon2 = Argon2::default();
    let password_hash = argon2
        .hash_password(b"!disabled_oidc_account!", &salt)
        .map_err(|_| AppError::Internal)?
        .to_string();
    let new_user = db
        .create_user(NewUser {
            username: base_username.clone(),
            password_hash,
            is_system: false,
            is_approved: true,
        })
        .await
        .map_err(|_| AppError::Internal)?;

    let _ = db.link_oidc_identity(&id, &subject, &new_user.id).await;
    let token = issue_jwt(&cfg, &new_user.username)?;
    audit::record_with_metadata(
        &db,
        Some(new_user.id.as_str()),
        "oidc.provision",
        Some("oidc_provider"),
        Some(&id),
        serde_json::json!({"sub": subject, "email": email, "name": name}),
    )
    .await;
    OIDC_LOGIN_TOTAL
        .with_label_values(&[id.as_str(), "provisioned"])
        .inc();

    Ok((
        StatusCode::OK,
        Json(serde_json::json!({
            "status": "provisioned",
            "provider": id,
            "sub": subject,
            "username": new_user.username,
            "redirect": flow.redirect,
            "token": token
        })),
    ))
}
