use axum::http::StatusCode;
use axum::{
    extract::{Path, Query},
    response::IntoResponse,
    Extension, Json,
};
use didhub_config::AppConfig;
use didhub_db::audit;
use didhub_db::settings::SettingOperations;
use didhub_db::users::UserOperations;
use didhub_db::{Db, NewUser};
use didhub_error::AppError;
use didhub_metrics::{OIDC_LOGIN_TOTAL, OIDC_SECRET_UPDATE_TOTAL};
use didhub_middleware::types::CurrentUser;
use didhub_oidc as oidc;
use jsonwebtoken::{encode, Algorithm, EncodingKey, Header};
use openidconnect::core::{CoreAuthenticationFlow, CoreClient, CoreProviderMetadata};
use openidconnect::{
    AuthorizationCode, ClientId, ClientSecret, CsrfToken, IssuerUrl, Nonce, OAuth2TokenResponse,
    PkceCodeChallenge, PkceCodeVerifier, RedirectUrl, Scope, TokenResponse,
};
use serde::Serialize;

// Placeholder provider registry until full OIDC integration.
#[derive(Clone, Debug, Serialize)]
pub struct OidcProviderInfo {
    pub id: String,
    pub name: String,
    pub enabled: bool,
}

fn provider_catalog() -> Vec<(String, String)> {
    vec![
        ("google".into(), "Google".into()),
        ("github".into(), "GitHub".into()),
        ("discord".into(), "Discord".into()),
    ]
}

fn is_valid_provider(id: &str) -> bool {
    provider_catalog().into_iter().any(|(pid, _)| pid == id)
}

fn get_provider_name(id: &str) -> &'static str {
    match id {
        "google" => "Google",
        "github" => "GitHub",
        "discord" => "Discord",
        _ => "Unknown",
    }
}

async fn get_global_oidc_enabled(db: &Db) -> Result<bool, AppError> {
    Ok(db
        .get_setting(GLOBAL_OIDC_KEY)
        .await
        .map_err(|_| AppError::Internal)?
        .and_then(|s| serde_json::from_str::<serde_json::Value>(&s.value).ok())
        .and_then(|v| v.as_bool())
        .unwrap_or(true))
}

#[derive(Debug)]
struct ProviderConfig {
    enabled: bool,
    client_id: Option<String>,
    client_secret: Option<String>,
}

async fn get_provider_config(db: &Db, id: &str) -> Result<ProviderConfig, AppError> {
    let enabled = db
        .get_setting(&setting_key(id))
        .await
        .map_err(|_| AppError::Internal)?
        .and_then(|s| serde_json::from_str::<serde_json::Value>(&s.value).ok())
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let client_id = db
        .get_setting(&client_id_key(id))
        .await
        .map_err(|_| AppError::Internal)?
        .and_then(|s| serde_json::from_str::<serde_json::Value>(&s.value).ok())
        .and_then(|v| v.as_str().map(|s| s.to_string()));
    let client_secret = db
        .get_setting(&client_secret_key(id))
        .await
        .map_err(|_| AppError::Internal)?
        .and_then(|s| serde_json::from_str::<serde_json::Value>(&s.value).ok())
        .and_then(|v| v.as_str().map(|s| s.to_string()));
    Ok(ProviderConfig {
        enabled,
        client_id,
        client_secret,
    })
}

async fn build_oidc_client(
    id: &str,
    issuer: &str,
    default_client_id: &str,
    default_client_secret: Option<&str>,
    settings: &oidc::ProviderSettings,
    db: &Db,
    http_client: &reqwest::Client,
) -> Result<
    openidconnect::Client<
        openidconnect::EmptyAdditionalClaims,
        openidconnect::core::CoreAuthDisplay,
        openidconnect::core::CoreGenderClaim,
        openidconnect::core::CoreJweContentEncryptionAlgorithm,
        openidconnect::core::CoreJsonWebKey,
        openidconnect::core::CoreAuthPrompt,
        openidconnect::StandardErrorResponse<openidconnect::core::CoreErrorResponseType>,
        openidconnect::StandardTokenResponse<
            openidconnect::IdTokenFields<
                openidconnect::EmptyAdditionalClaims,
                openidconnect::EmptyExtraTokenFields,
                openidconnect::core::CoreGenderClaim,
                openidconnect::core::CoreJweContentEncryptionAlgorithm,
                openidconnect::core::CoreJwsSigningAlgorithm,
            >,
            openidconnect::core::CoreTokenType,
        >,
        openidconnect::StandardTokenIntrospectionResponse<
            openidconnect::EmptyExtraTokenFields,
            openidconnect::core::CoreTokenType,
        >,
        openidconnect::core::CoreRevocableToken,
        openidconnect::StandardErrorResponse<openidconnect::RevocationErrorResponseType>,
        openidconnect::EndpointSet,
        openidconnect::EndpointNotSet,
        openidconnect::EndpointNotSet,
        openidconnect::EndpointNotSet,
        openidconnect::EndpointMaybeSet,
        openidconnect::EndpointMaybeSet,
    >,
    AppError,
> {
    let config = get_provider_config(db, id).await?;
    let client_id = config
        .client_id
        .unwrap_or_else(|| default_client_id.to_string());
    let client_secret = config
        .client_secret
        .or_else(|| default_client_secret.map(|s| s.to_string()));
    let issuer = IssuerUrl::new(issuer.to_string()).map_err(|_| AppError::Internal)?;
    let metadata = CoreProviderMetadata::discover_async(issuer, http_client)
        .await
        .map_err(|_| AppError::Internal)?;
    let client = CoreClient::from_provider_metadata(
        metadata,
        ClientId::new(client_id),
        client_secret.map(ClientSecret::new),
    );
    let client = client.set_redirect_uri(
        RedirectUrl::new(settings.redirect_uri.clone()).map_err(|_| AppError::Internal)?,
    );
    Ok(client)
}

async fn get_provider_admin_view(db: &Db, id: &str) -> Result<ProviderAdminView, AppError> {
    let config = get_provider_config(db, id).await?;
    let current_cid = config.client_id.unwrap_or_default();
    let has_secret = config.client_secret.map(|s| !s.is_empty()).unwrap_or(false);
    let name = get_provider_name(id).to_string();
    Ok(ProviderAdminView {
        id: id.to_string(),
        name,
        enabled: config.enabled,
        has_client_secret: has_secret,
        client_id: mask_client_id(&current_cid),
    })
}

// Temporary stub: in future load from settings table (json list) or dedicated table.
// provider_stub_config removed; use ProviderSettings extension

fn setting_key(id: &str) -> String {
    format!("oidc_provider_enabled_{}", id)
}
fn client_id_key(id: &str) -> String {
    format!("oidc_provider_client_id_{}", id)
}
fn client_secret_key(id: &str) -> String {
    format!("oidc_provider_client_secret_{}", id)
}
const GLOBAL_OIDC_KEY: &str = "oidc_enabled";

#[derive(Serialize)]
pub struct OidcPublicProvider {
    pub id: String,
    pub name: String,
}

pub async fn public_providers(
    Extension(db): Extension<Db>,
) -> Result<Json<Vec<OidcPublicProvider>>, AppError> {
    // Global toggle
    let globally_enabled = get_global_oidc_enabled(&db).await?;
    if !globally_enabled {
        return Ok(Json(vec![]));
    }
    let mut list = Vec::new();
    for (id, name) in provider_catalog() {
        let config = get_provider_config(&db, &id).await?;
        if config.enabled {
            list.push(OidcPublicProvider { id, name });
        }
    }
    Ok(Json(list))
}

pub async fn list_providers(
    Extension(db): Extension<Db>,
    Extension(user): Extension<CurrentUser>,
) -> Result<Json<Vec<OidcProviderInfo>>, AppError> {
    if !user.is_admin {
        return Err(AppError::Forbidden);
    }
    let mut out = Vec::new();
    for (id, name) in provider_catalog() {
        let config = get_provider_config(&db, &id).await?;
        out.push(OidcProviderInfo {
            id,
            name,
            enabled: config.enabled,
        });
    }
    Ok(Json(out))
}

#[derive(serde::Deserialize)]
pub struct EnableBody {
    pub enabled: bool,
}

pub async fn set_enabled(
    Extension(db): Extension<Db>,
    Extension(user): Extension<CurrentUser>,
    Path(id): Path<String>,
    Json(body): Json<EnableBody>,
) -> Result<Json<OidcProviderInfo>, AppError> {
    if !user.is_admin {
        return Err(AppError::Forbidden);
    }
    if !is_valid_provider(&id) {
        return Err(AppError::NotFound);
    }
    let key = setting_key(&id);
    let serialized = serde_json::to_string(&serde_json::json!(body.enabled)).unwrap();
    db.upsert_setting(&key, &serialized)
        .await
        .map_err(|_| AppError::Internal)?;
    let name = get_provider_name(&id).to_string();
    Ok(Json(OidcProviderInfo {
        id,
        name,
        enabled: body.enabled,
    }))
}

#[derive(serde::Deserialize)]
pub struct AuthorizeQuery {
    pub redirect: Option<String>,
}

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
    // PKCE challenge via crate
    let (pkce_challenge, pkce_verifier) = PkceCodeChallenge::new_random_sha256();
    // Authorization URL
    let mut auth = client.authorize_url(
        CoreAuthenticationFlow::AuthorizationCode,
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
    // Persist flow (state -> verifier & nonce)
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
    // Append provider specific params (e.g. Google offline access) if needed
    let final_url = if prov.id == "google" {
        let mut u = auth_url.to_string();
        if !u.contains("access_type=") {
            if u.contains('?') {
                u.push_str("&access_type=offline");
            } else {
                u.push_str("?access_type=offline");
            }
        }
        u
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
        .ok_or_else(|| AppError::BadRequest("invalid state".into()))?; // single-use
    if flow.provider != id {
        return Err(AppError::BadRequest("provider mismatch".into()));
    }
    let config = get_provider_config(&db, &id).await?;
    if !config.enabled {
        return Err(AppError::Forbidden);
    }
    let prov = settings.get(&id).ok_or(AppError::NotFound)?.clone();
    // Short-circuit if not configured
    if config
        .client_id
        .as_ref()
        .unwrap_or(&prov.client_id)
        .starts_with("CHANGE_ME_")
    {
        return Ok((
            StatusCode::NOT_IMPLEMENTED,
            Json(serde_json::json!({
                "status":"provider_not_configured",
                "provider": id,
                "detail":"Configure client_id/client_secret to enable token exchange"
            })),
        ));
    }
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
    // Perform token exchange with PKCE verifier
    let pkce_verifier = PkceCodeVerifier::new(flow.code_verifier.clone());
    let token_req = match client.exchange_code(AuthorizationCode::new(code)) {
        Ok(r) => r,
        Err(_) => return Err(AppError::BadRequest("invalid authorization code".into())),
    };
    let token_response = match token_req
        .set_pkce_verifier(pkce_verifier)
        .request_async(&http_client)
        .await
    {
        Ok(r) => r,
        Err(_) => return Err(AppError::BadRequest("token exchange failed".into())),
    };
    // Validate ID token & nonce
    let id_token = token_response
        .id_token()
        .ok_or_else(|| AppError::BadRequest("missing id_token".into()))?;
    let id_token_verifier = client.id_token_verifier();
    let nonce = Nonce::new(flow.nonce.clone());
    let claims = match id_token.claims(&id_token_verifier, &nonce) {
        Ok(c) => c,
        Err(_) => return Err(AppError::BadRequest("id_token verification failed".into())),
    };
    // Access token hash check (optional; only if claim present)
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
    // Extract basic profile data (may be absent depending on scopes/provider)
    let subject = claims.subject().as_str().to_string();
    let email = claims.email().map(|e| e.as_str().to_string());
    let name = claims
        .name()
        .map(|n| n.get(None).map(|s| s.to_string()))
        .flatten();
    // User mapping logic:
    // 1. Try existing mapping (provider, subject)
    if let Ok(Some(existing)) = db.fetch_user_by_oidc(&id, &subject).await {
        let token = issue_jwt(&cfg, &existing.username)?;
        audit::record_with_metadata(
            &db,
            Some(existing.id),
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
                "status":"login_success",
                "provider": id,
                "sub": subject,
                "username": existing.username,
                "redirect": flow.redirect,
                "token": token
            })),
        ));
    }
    // 2. Attempt lookup by email (if provided) to link existing account.
    if let Some(em) = email.as_ref() {
        let em_str = em.as_str();
        if let Ok(Some(existing_by_username)) = db.fetch_user_by_username(em_str).await {
            // using email as username fall-back
            let _ = db
                .link_oidc_identity(&id, &subject, existing_by_username.id)
                .await;
            let token = issue_jwt(&cfg, &existing_by_username.username)?;
            audit::record_with_metadata(
                &db,
                Some(existing_by_username.id),
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
                    "status":"login_success_linked",
                    "provider": id,
                    "sub": subject,
                    "username": existing_by_username.username,
                    "redirect": flow.redirect,
                    "token": token
                })),
            ));
        }
    }
    // 3. Provision new user (username preference: email else subject-based)
    let base_username = email
        .as_ref()
        .or(name.as_ref())
        .map(|s| s.as_str().to_lowercase())
        .unwrap_or_else(|| format!("{}:{}", id, subject));
    let final_username = base_username;
    // Create with random password hash placeholder
    let password_hash = bcrypt::hash("!disabled_oidc_account!", bcrypt::DEFAULT_COST)
        .map_err(|_| AppError::Internal)?;
    let new_user = db
        .create_user(NewUser {
            username: final_username.clone(),
            password_hash,
            is_system: false,
            is_approved: true,
        })
        .await
        .map_err(|_| AppError::Internal)?;
    let _ = db.link_oidc_identity(&id, &subject, new_user.id).await;
    let token = issue_jwt(&cfg, &new_user.username)?;
    audit::record_with_metadata(
        &db,
        Some(new_user.id),
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
            "status":"provisioned",
            "provider": id,
            "sub": subject,
            "username": new_user.username,
            "redirect": flow.redirect,
            "token": token
        })),
    ))
}

#[derive(serde::Serialize, serde::Deserialize)]
struct JwtClaims {
    sub: String,
    exp: usize,
}
fn issue_jwt(cfg: &AppConfig, username: &str) -> Result<String, AppError> {
    use std::time::{SystemTime, UNIX_EPOCH};
    let exp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs()
        + 60 * 60 * 24 * 7;
    let claims = JwtClaims {
        sub: username.to_string(),
        exp: exp as usize,
    };
    encode(
        &Header::new(Algorithm::HS256),
        &claims,
        &EncodingKey::from_secret(cfg.jwt_secret.as_bytes()),
    )
    .map_err(|_| AppError::Internal)
}

// --- Secret / client configuration management ---

#[derive(serde::Deserialize)]
pub struct UpdateSecretBody {
    pub client_id: Option<String>,
    pub client_secret: Option<String>,
    pub enabled: Option<bool>,
}

#[derive(serde::Serialize)]
pub struct ProviderAdminView {
    pub id: String,
    pub name: String,
    pub enabled: bool,
    pub has_client_secret: bool,
    pub client_id: String,
}

fn mask_client_id(s: &str) -> String {
    if s.is_empty() {
        return "".into();
    }
    let len = s.len();
    if len <= 8 {
        return "********".into();
    }
    let head = &s[..4];
    let tail = &s[len - 4..];
    format!("{}...{}", head, tail)
}

pub async fn update_secret(
    Path(id): Path<String>,
    Extension(db): Extension<Db>,
    Extension(user): Extension<CurrentUser>,
    Json(body): Json<UpdateSecretBody>,
) -> Result<Json<ProviderAdminView>, AppError> {
    if !user.is_admin {
        return Err(AppError::Forbidden);
    }
    // Validate provider exists in catalog for now
    if !is_valid_provider(&id) {
        return Err(AppError::NotFound);
    }
    let mut client_id_changed = false;
    let mut secret_changed = false;
    if let Some(ref cid) = body.client_id {
        let serialized = serde_json::to_string(&serde_json::json!(cid)).unwrap();
        db.upsert_setting(&client_id_key(&id), &serialized)
            .await
            .map_err(|_| AppError::Internal)?;
        client_id_changed = true;
    }
    if let Some(ref secret) = body.client_secret {
        let serialized = serde_json::to_string(&serde_json::json!(secret)).unwrap();
        db.upsert_setting(&client_secret_key(&id), &serialized)
            .await
            .map_err(|_| AppError::Internal)?;
        secret_changed = true;
    }
    if let Some(en) = body.enabled {
        let serialized = serde_json::to_string(&serde_json::json!(en)).unwrap();
        db.upsert_setting(&setting_key(&id), &serialized)
            .await
            .map_err(|_| AppError::Internal)?;
    }
    audit::record_with_metadata(
        &db,
        Some(user.id),
        "oidc.secret.update",
        Some("oidc_provider"),
        Some(&id),
        serde_json::json!({
            "client_id_changed": client_id_changed, "secret_changed": secret_changed
        }),
    )
    .await;
    if client_id_changed || secret_changed {
        OIDC_SECRET_UPDATE_TOTAL
            .with_label_values(&[id.as_str()])
            .inc();
    }
    // Compose response
    get_provider_admin_view(&db, &id).await.map(Json)
}

pub async fn get_secret(
    Path(id): Path<String>,
    Extension(db): Extension<Db>,
    Extension(user): Extension<CurrentUser>,
) -> Result<Json<ProviderAdminView>, AppError> {
    if !user.is_admin {
        return Err(AppError::Forbidden);
    }
    if !is_valid_provider(&id) {
        return Err(AppError::NotFound);
    }
    get_provider_admin_view(&db, &id).await.map(Json)
}
