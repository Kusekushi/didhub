use didhub_config::AppConfig;
use didhub_db::settings::SettingOperations;
use didhub_db::Db;
use didhub_error::AppError;
use didhub_oidc as oidc;
use jsonwebtoken::{encode, Algorithm, EncodingKey, Header};
use openidconnect::core::{CoreClient, CoreProviderMetadata};
use openidconnect::{ClientId, ClientSecret, IssuerUrl, RedirectUrl};
use serde::{Deserialize, Serialize};

mod authorize;
mod callback;
mod get_secret;
mod list_providers;
mod public_providers;
mod set_enabled;
mod update_secret;

pub use authorize::authorize;
pub use callback::callback;
pub use get_secret::get_secret;
pub use list_providers::list_providers;
pub use public_providers::public_providers;
pub use set_enabled::set_enabled;
pub use update_secret::update_secret;

#[derive(Clone, Debug, Serialize)]
pub struct OidcProviderInfo {
    pub id: String,
    pub name: String,
    pub enabled: bool,
}

#[derive(Serialize)]
pub struct OidcPublicProvider {
    pub id: String,
    pub name: String,
}

#[derive(Deserialize)]
pub struct EnableBody {
    pub enabled: bool,
}

#[derive(Deserialize)]
pub struct AuthorizeQuery {
    pub redirect: Option<String>,
}

#[derive(Deserialize)]
pub struct UpdateSecretBody {
    pub client_id: Option<String>,
    pub client_secret: Option<String>,
    pub enabled: Option<bool>,
}

#[derive(Serialize)]
pub struct ProviderAdminView {
    pub id: String,
    pub name: String,
    pub enabled: bool,
    pub has_client_secret: bool,
    pub client_id: String,
}

pub(super) fn provider_catalog() -> Vec<(String, String)> {
    vec![
        ("google".into(), "Google".into()),
        ("github".into(), "GitHub".into()),
        ("discord".into(), "Discord".into()),
    ]
}

pub(super) fn is_valid_provider(id: &str) -> bool {
    provider_catalog().into_iter().any(|(pid, _)| pid == id)
}

pub(super) fn get_provider_name(id: &str) -> &'static str {
    match id {
        "google" => "Google",
        "github" => "GitHub",
        "discord" => "Discord",
        _ => "Unknown",
    }
}

pub(super) async fn get_global_oidc_enabled(db: &Db) -> Result<bool, AppError> {
    Ok(db
        .get_setting(GLOBAL_OIDC_KEY)
        .await
        .map_err(|_| AppError::Internal)?
        .and_then(|s| serde_json::from_str::<serde_json::Value>(&s.value).ok())
        .and_then(|v| v.as_bool())
        .unwrap_or(true))
}

#[derive(Debug)]
pub(super) struct ProviderConfig {
    pub enabled: bool,
    pub client_id: Option<String>,
    pub client_secret: Option<String>,
}

pub(super) async fn get_provider_config(db: &Db, id: &str) -> Result<ProviderConfig, AppError> {
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

#[allow(clippy::type_complexity)]
pub(super) async fn build_oidc_client(
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

pub(super) async fn get_provider_admin_view(
    db: &Db,
    id: &str,
) -> Result<ProviderAdminView, AppError> {
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

pub(super) fn setting_key(id: &str) -> String {
    format!("oidc_provider_enabled_{}", id)
}

pub(super) fn client_id_key(id: &str) -> String {
    format!("oidc_provider_client_id_{}", id)
}

pub(super) fn client_secret_key(id: &str) -> String {
    format!("oidc_provider_client_secret_{}", id)
}

const GLOBAL_OIDC_KEY: &str = "feature.oidc.enabled";

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

#[derive(serde::Serialize, serde::Deserialize)]
struct JwtClaims {
    sub: String,
    exp: usize,
}

pub(super) fn issue_jwt(cfg: &AppConfig, username: &str) -> Result<String, AppError> {
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
