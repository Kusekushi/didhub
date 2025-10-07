use anyhow::Result;
use openidconnect::{
    core::{CoreAuthenticationFlow, CoreClient, CoreProviderMetadata},
    core::{
        CoreGenderClaim, CoreJweContentEncryptionAlgorithm, CoreJwsSigningAlgorithm, CoreTokenType,
    },
    reqwest::ClientBuilder,
    AuthorizationCode, Client, ClientId, ClientSecret, CsrfToken, EmptyAdditionalClaims,
    EmptyExtraTokenFields, IdTokenFields, IssuerUrl, Nonce, OAuth2TokenResponse, PkceCodeChallenge,
    PkceCodeVerifier, RedirectUrl, Scope, StandardTokenResponse, TokenResponse,
};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    sync::Arc,
    time::{Duration, Instant},
};
use tokio::sync::RwLock;
use tracing::{debug, info, warn};

use rand; // Added import for random number generation

type OidcTokenResponse = StandardTokenResponse<
    IdTokenFields<
        EmptyAdditionalClaims,
        EmptyExtraTokenFields,
        CoreGenderClaim,
        CoreJweContentEncryptionAlgorithm,
        CoreJwsSigningAlgorithm,
    >,
    CoreTokenType,
>;

#[derive(Clone, Debug)]
pub struct OidcClient {
    pub client: OidcClientType,
    pub http_client: reqwest::Client,
}

type OidcClientType = Client<
    EmptyAdditionalClaims,
    openidconnect::core::CoreAuthDisplay,
    CoreGenderClaim,
    CoreJweContentEncryptionAlgorithm,
    openidconnect::core::CoreJsonWebKey,
    openidconnect::core::CoreAuthPrompt,
    openidconnect::StandardErrorResponse<openidconnect::core::CoreErrorResponseType>,
    OidcTokenResponse,
    openidconnect::StandardTokenIntrospectionResponse<
        EmptyExtraTokenFields,
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
>;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ProviderConfig {
    pub id: String,
    pub name: Option<String>,
    pub issuer: String,
    pub client_id: String,
    pub client_secret: Option<String>,
    pub scopes: Option<Vec<String>>,
    pub enabled: bool,
    pub allow_signup: Option<bool>,
}

#[derive(Clone, Debug)]
pub struct ProviderSettings {
    pub providers: HashMap<String, ProviderConfig>,
    pub redirect_uri: String,
}

impl ProviderSettings {
    pub fn from_env() -> Self {
        let mut providers = HashMap::new();

        // Google
        let google_enabled = std::env::var("GOOGLE_OIDC_CLIENT_ID").is_ok();
        let google_config = ProviderConfig {
            id: "google".into(),
            name: Some("Google".into()),
            issuer: "https://accounts.google.com".into(),
            client_id: std::env::var("GOOGLE_OIDC_CLIENT_ID")
                .unwrap_or_else(|_| "CHANGE_ME_GOOGLE_CLIENT_ID".into()),
            client_secret: std::env::var("GOOGLE_OIDC_CLIENT_SECRET").ok(),
            scopes: Some(vec!["openid".into(), "email".into(), "profile".into()]),
            enabled: google_enabled,
            allow_signup: Some(true),
        };
        if google_enabled {
            info!(provider="google", client_id=%google_config.client_id, "Google OIDC provider enabled");
        } else {
            debug!("Google OIDC provider disabled (no client ID configured)");
        }
        providers.insert("google".into(), google_config);

        // Discord
        let discord_enabled = std::env::var("DISCORD_OIDC_CLIENT_ID").is_ok();
        let discord_config = ProviderConfig {
            id: "discord".into(),
            name: Some("Discord".into()),
            issuer: "https://discord.com".into(),
            client_id: std::env::var("DISCORD_OIDC_CLIENT_ID")
                .unwrap_or_else(|_| "CHANGE_ME_DISCORD_CLIENT_ID".into()),
            client_secret: std::env::var("DISCORD_OIDC_CLIENT_SECRET").ok(),
            scopes: Some(vec!["openid".into(), "identify".into(), "email".into()]),
            enabled: discord_enabled,
            allow_signup: Some(true),
        };
        if discord_enabled {
            info!(provider="discord", client_id=%discord_config.client_id, "Discord OIDC provider enabled");
        } else {
            debug!("Discord OIDC provider disabled (no client ID configured)");
        }
        providers.insert("discord".into(), discord_config);

        let redirect_uri = std::env::var("OIDC_REDIRECT_URI")
            .unwrap_or_else(|_| "http://localhost:5173/oidc/callback".into());

        info!(redirect_uri=%redirect_uri, provider_count=%providers.len(), "OIDC provider settings initialized");

        Self {
            providers,
            redirect_uri,
        }
    }
    pub fn get(&self, id: &str) -> Option<&ProviderConfig> {
        self.providers.get(id)
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct DiscoveryDoc {
    pub authorization_endpoint: String,
    pub token_endpoint: String,
    pub jwks_uri: String,
}

impl OidcClient {
    pub async fn discover(
        issuer: &str,
        client_id: String,
        client_secret: Option<String>,
        redirect_uri: String,
    ) -> Result<Self> {
        let http_client = ClientBuilder::new()
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .map_err(|e| anyhow::anyhow!("Failed to build HTTP client: {}", e))?;

        let issuer_url = IssuerUrl::new(issuer.to_string())
            .map_err(|e| anyhow::anyhow!("Invalid issuer URL: {}", e))?;

        let metadata = CoreProviderMetadata::discover_async(issuer_url, &http_client)
            .await
            .map_err(|e| anyhow::anyhow!("Failed to discover OIDC metadata: {}", e))?;

        let client = CoreClient::from_provider_metadata(
            metadata,
            ClientId::new(client_id),
            client_secret.map(ClientSecret::new),
        )
        .set_redirect_uri(
            RedirectUrl::new(redirect_uri)
                .map_err(|e| anyhow::anyhow!("Invalid redirect URI: {}", e))?,
        );

        Ok(OidcClient {
            client,
            http_client,
        })
    }

    pub fn generate_pkce(&self) -> (PkceCodeChallenge, PkceCodeVerifier) {
        PkceCodeChallenge::new_random_sha256()
    }

    pub fn build_authorization_url(
        &self,
        scopes: Vec<String>,
        pkce_challenge: PkceCodeChallenge,
    ) -> (String, CsrfToken, Nonce) {
        let mut auth_request = self.client.authorize_url(
            openidconnect::core::CoreAuthenticationFlow::AuthorizationCode,
            CsrfToken::new_random,
            Nonce::new_random,
        );

        for scope in scopes {
            auth_request = auth_request.add_scope(Scope::new(scope));
        }

        auth_request = auth_request.set_pkce_challenge(pkce_challenge);

        let (url, csrf_token, nonce) = auth_request.url();
        (url.to_string(), csrf_token, nonce)
    }

    pub async fn exchange_code(
        &self,
        code: String,
        pkce_verifier: PkceCodeVerifier,
        nonce: Nonce,
    ) -> Result<OidcTokenResponse> {
        let token_request = self
            .client
            .exchange_code(AuthorizationCode::new(code))
            .map_err(|_| anyhow::anyhow!("Invalid authorization code"))?
            .set_pkce_verifier(pkce_verifier);

        let token_response = token_request
            .request_async(&self.http_client)
            .await
            .map_err(|e| anyhow::anyhow!("Token exchange failed: {}", e))?;

        // Verify ID token
        if let Some(id_token) = token_response.id_token() {
            let verifier = self.client.id_token_verifier();
            id_token
                .claims(&verifier, &nonce)
                .map_err(|e| anyhow::anyhow!("ID token verification failed: {}", e))?;

            // Verify access token hash if present
            if let Some(expected_hash) = id_token.claims(&verifier, &nonce)?.access_token_hash() {
                if let (Ok(alg), Ok(signing_key)) =
                    (id_token.signing_alg(), id_token.signing_key(&verifier))
                {
                    if let Ok(actual_hash) = openidconnect::AccessTokenHash::from_token(
                        token_response.access_token(),
                        alg,
                        signing_key,
                    ) {
                        if &actual_hash != expected_hash {
                            return Err(anyhow::anyhow!("Access token hash mismatch"));
                        }
                    }
                }
            }
        }

        Ok(token_response)
    }
}

#[derive(Clone, Debug)]
pub struct OidcState {
    discovery: Arc<RwLock<HashMap<String, CachedDiscovery>>>,
    clients: Arc<RwLock<HashMap<String, CachedClient>>>,
    flows: Arc<RwLock<HashMap<String, FlowState>>>,
}

#[derive(Clone, Debug)]
struct CachedDiscovery {
    doc: DiscoveryDoc,
    fetched_at: Instant,
}

#[derive(Clone, Debug)]
struct CachedClient {
    client: OidcClient,
    cached_at: Instant,
}

#[derive(Clone, Debug)]
pub struct FlowState {
    pub provider: String,
    pub code_verifier: String,
    pub nonce: String,
    pub created_at: Instant,
    pub redirect: Option<String>,
}

impl OidcState {
    pub fn new() -> Self {
        Self {
            discovery: Arc::new(RwLock::new(HashMap::new())),
            clients: Arc::new(RwLock::new(HashMap::new())),
            flows: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    pub async fn cache_discovery(&self, provider: &str, doc: DiscoveryDoc) {
        self.discovery.write().await.insert(
            provider.to_string(),
            CachedDiscovery {
                doc,
                fetched_at: Instant::now(),
            },
        );
        debug!(provider=%provider, "cached OIDC discovery document");
    }

    pub async fn get_discovery(&self, provider: &str) -> Option<DiscoveryDoc> {
        let result = self
            .discovery
            .read()
            .await
            .get(provider)
            .map(|c| c.doc.clone());
        if result.is_some() {
            debug!(provider=%provider, "retrieved cached OIDC discovery document");
        } else {
            debug!(provider=%provider, "no cached OIDC discovery document found");
        }
        result
    }

    pub async fn cache_client(&self, provider: &str, client: OidcClient) {
        self.clients.write().await.insert(
            provider.to_string(),
            CachedClient {
                client,
                cached_at: Instant::now(),
            },
        );
        debug!(provider=%provider, "cached OIDC client");
    }

    pub async fn get_client(&self, provider: &str) -> Option<OidcClient> {
        let result = self
            .clients
            .read()
            .await
            .get(provider)
            .map(|c| c.client.clone());
        if result.is_some() {
            debug!(provider=%provider, "retrieved cached OIDC client");
        } else {
            debug!(provider=%provider, "no cached OIDC client found");
        }
        result
    }

    pub async fn get_or_build_client(
        &self,
        provider: &str,
        issuer: &str,
        client_id: &str,
        client_secret: Option<&str>,
        redirect_uri: &str,
        ttl: Duration,
    ) -> Result<OidcClient> {
        if let Some(cached) = self.clients.read().await.get(provider) {
            if cached.cached_at.elapsed() < ttl {
                debug!(provider=%provider, "using cached OIDC client");
                return Ok(cached.client.clone());
            } else {
                debug!(provider=%provider, "cached OIDC client expired");
            }
        }

        info!(provider=%provider, issuer=%issuer, "building OIDC client");
        let oidc_client = OidcClient::discover(
            issuer,
            client_id.to_string(),
            client_secret.map(|s| s.to_string()),
            redirect_uri.to_string(),
        )
        .await?;
        self.cache_client(provider, oidc_client.clone()).await;
        Ok(oidc_client)
    }

    pub async fn insert_flow(&self, state: &str, flow: FlowState) {
        let provider = flow.provider.clone();
        self.flows.write().await.insert(state.to_string(), flow);
        debug!(provider=%provider, state=%state, "inserted OIDC authentication flow");
    }

    pub async fn take_flow(&self, state: &str) -> Option<FlowState> {
        let flow = self.flows.write().await.remove(state);
        if let Some(ref f) = flow {
            debug!(provider=%f.provider, state=%state, "removed OIDC authentication flow");
        } else {
            warn!(state=%state, "attempted to remove non-existent OIDC authentication flow");
        }
        flow
    }

    pub async fn complete_flow(
        &self,
        state: &str,
        code: &str,
        client: &OidcClient,
    ) -> Result<(OidcTokenResponse, FlowState)> {
        let flow = self
            .take_flow(state)
            .await
            .ok_or_else(|| anyhow::anyhow!("Invalid or expired state"))?;

        let pkce_verifier = PkceCodeVerifier::new(flow.code_verifier.clone());
        let nonce = Nonce::new(flow.nonce.clone());

        let token_response = client
            .exchange_code(code.to_string(), pkce_verifier, nonce)
            .await?;

        Ok((token_response, flow))
    }

    pub async fn initiate_flow(
        &self,
        provider: &str,
        client: &OidcClient,
        scopes: Vec<String>,
        redirect_uri: Option<String>,
    ) -> (String, FlowState) {
        let state = format!("{:x}", rand::random::<u64>());
        let nonce = Nonce::new_random();
        let (pkce_challenge, pkce_verifier) = PkceCodeChallenge::new_random_sha256();

        let state_clone = state.clone();
        let nonce_clone = nonce.clone();

        let mut auth_request = client
            .client
            .authorize_url(
                CoreAuthenticationFlow::AuthorizationCode,
                move || CsrfToken::new(state_clone.clone()),
                move || nonce_clone.clone(),
            )
            .add_scope(Scope::new("openid".to_string()));

        for scope in scopes {
            auth_request = auth_request.add_scope(Scope::new(scope));
        }

        auth_request = auth_request.set_pkce_challenge(pkce_challenge.clone());

        if let Some(redirect) = &redirect_uri {
            auth_request = auth_request.set_redirect_uri(std::borrow::Cow::Owned(
                RedirectUrl::new(redirect.clone()).expect("Invalid redirect URI"),
            ));
        }

        let (auth_url, _, _) = auth_request.url();

        let flow = FlowState {
            provider: provider.to_string(),
            nonce: nonce.secret().clone(),
            code_verifier: pkce_verifier.secret().clone(),
            redirect: redirect_uri,
            created_at: std::time::Instant::now(),
        };

        self.insert_flow(&state, flow.clone()).await;

        (auth_url.to_string(), flow)
    }

    pub async fn cleanup_flows(&self, max_age: Duration) {
        let mut flows = self.flows.write().await;
        let mut to_remove = Vec::new();

        for (state, flow) in flows.iter() {
            if flow.created_at.elapsed() > max_age {
                to_remove.push(state.clone());
            }
        }

        for state in to_remove {
            flows.remove(&state);
            debug!(state=%state, "cleaned up expired OIDC flow");
        }
    }

    pub async fn get_or_fetch_discovery(
        &self,
        provider: &str,
        issuer: &str,
        ttl: Duration,
    ) -> Result<DiscoveryDoc> {
        if let Some(cached) = self.discovery.read().await.get(provider) {
            if cached.fetched_at.elapsed() < ttl {
                debug!(provider=%provider, "using cached OIDC discovery document");
                return Ok(cached.doc.clone());
            } else {
                debug!(provider=%provider, "cached OIDC discovery document expired");
            }
        }

        info!(provider=%provider, issuer=%issuer, "fetching OIDC discovery document");
        let doc = fetch_discovery(issuer).await?;
        self.cache_discovery(provider, doc.clone()).await;
        Ok(doc)
    }
}

pub async fn fetch_discovery(issuer: &str) -> Result<DiscoveryDoc> {
    let url = format!(
        "{}/.well-known/openid-configuration",
        issuer.trim_end_matches('/')
    );

    debug!(issuer=%issuer, discovery_url=%url, "fetching OIDC discovery document");
    let resp = reqwest::get(&url).await?.error_for_status()?;
    let v: serde_json::Value = resp.json().await?;

    let auth = v
        .get("authorization_endpoint")
        .and_then(|x| x.as_str())
        .ok_or_else(|| anyhow::anyhow!("missing authorization_endpoint"))?;
    let token = v
        .get("token_endpoint")
        .and_then(|x| x.as_str())
        .ok_or_else(|| anyhow::anyhow!("missing token_endpoint"))?;
    let jwks = v
        .get("jwks_uri")
        .and_then(|x| x.as_str())
        .ok_or_else(|| anyhow::anyhow!("missing jwks_uri"))?;

    info!(
        issuer=%issuer,
        authorization_endpoint=%auth,
        token_endpoint=%token,
        jwks_uri=%jwks,
        "successfully fetched OIDC discovery document"
    );

    Ok(DiscoveryDoc {
        authorization_endpoint: auth.to_string(),
        token_endpoint: token.to_string(),
        jwks_uri: jwks.to_string(),
    })
}

#[derive(Debug, Clone)]
pub struct UserInfo {
    pub subject: String,
    pub email: Option<String>,
    pub name: Option<String>,
    pub email_verified: Option<bool>,
}

pub fn extract_user_info(token_response: &OidcTokenResponse) -> Result<UserInfo> {
    let id_token = token_response
        .id_token()
        .ok_or_else(|| anyhow::anyhow!("Missing ID token"))?;

    // For extraction, we'll use an insecure verifier since we already verified the token
    // In a real implementation, you'd want to cache the verifier
    let dummy_verifier: openidconnect::IdTokenVerifier<openidconnect::core::CoreJsonWebKey> =
        openidconnect::IdTokenVerifier::new_insecure_without_verification();
    let nonce = Nonce::new_random(); // This won't be used for claims extraction

    let claims = id_token
        .claims(&dummy_verifier, &nonce)
        .map_err(|e| anyhow::anyhow!("Failed to extract claims: {}", e))?;

    let subject = claims.subject().as_str().to_string();
    let email = claims.email().map(|e| e.as_str().to_string());
    let name = claims
        .name()
        .and_then(|n| n.get(None).map(|s| s.to_string()));
    let email_verified = claims.email_verified();

    Ok(UserInfo {
        subject,
        email,
        name,
        email_verified,
    })
}

// random_bytes removed — not used anywhere in the codebase
