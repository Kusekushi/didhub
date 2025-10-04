use axum::extract::{Path, Query};
use axum::response::IntoResponse;
use axum::Extension;
use didhub_db::{audit, Db};
use didhub_error::AppError;
use didhub_middleware::types::CurrentUser;
use didhub_oidc as oidc;
use openidconnect::{CsrfToken, Nonce, PkceCodeChallenge, Scope};

use super::{build_oidc_client, get_global_oidc_enabled, get_provider_config, AuthorizeQuery};

pub async fn authorize(
    Path(id): Path<String>,
    Query(q): Query<AuthorizeQuery>,
    user: Option<Extension<CurrentUser>>,
    Extension(db): Extension<Db>,
    Extension(ostate): Extension<oidc::OidcState>,
    Extension(settings): Extension<oidc::ProviderSettings>,
) -> Result<impl IntoResponse, AppError> {
    let globally_enabled = get_global_oidc_enabled(&db).await?;
    if !globally_enabled {
        return Err(AppError::Forbidden);
    }

    let config = get_provider_config(&db, &id).await?;
    if !config.enabled {
        return Err(AppError::Forbidden);
    }

    let prov = settings.get(&id).ok_or(AppError::NotFound)?.clone();
    let http_client = openidconnect::reqwest::ClientBuilder::new()
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

    let (pkce_challenge, pkce_verifier) = PkceCodeChallenge::new_random_sha256();

    let mut auth = client.authorize_url(
        openidconnect::core::CoreAuthenticationFlow::AuthorizationCode,
        CsrfToken::new_random,
        Nonce::new_random,
    );

    for scope in prov
        .scopes
        .clone()
        .unwrap_or_else(|| vec!["openid".into(), "profile".into(), "email".into()])
    {
        auth = auth.add_scope(Scope::new(scope));
    }

    auth = auth.set_pkce_challenge(pkce_challenge);
    let (auth_url, csrf_token, nonce) = auth.url();

    ostate
        .insert_flow(
            csrf_token.secret(),
            oidc::FlowState {
                provider: prov.id.clone(),
                code_verifier: pkce_verifier.secret().clone(),
                nonce: nonce.secret().clone(),
                created_at: std::time::Instant::now(),
                redirect: q.redirect.clone(),
            },
        )
        .await;

    let final_url = if prov.id == "google" {
        let mut url = auth_url.to_string();
        if !url.contains("access_type=") {
            if url.contains('?') {
                url.push_str("&access_type=offline");
            } else {
                url.push_str("?access_type=offline");
            }
        }
        url
    } else {
        auth_url.to_string()
    };

    audit::record_with_metadata(
        &db,
        user.as_ref().map(|u| u.id),
        "oidc.authorize",
        Some("oidc_provider"),
        Some(&prov.id),
        serde_json::json!({"state": csrf_token.secret(), "redirect": q.redirect}),
    )
    .await;

    Ok(axum::response::Redirect::to(&final_url))
}
