use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    sync::Arc,
    time::{Duration, Instant},
};
use tokio::sync::RwLock;
use tracing::{debug, info, warn};
// rand utilities removed; no longer needed in this module

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

#[derive(Clone, Debug)]
struct CachedDiscovery {
    doc: DiscoveryDoc,
    fetched_at: Instant,
}

#[derive(Clone, Debug)]
pub struct OidcState {
    discovery: Arc<RwLock<HashMap<String, CachedDiscovery>>>,
    flows: Arc<RwLock<HashMap<String, FlowState>>>,
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
        let result = self.discovery
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

    pub async fn cleanup_flows(&self, max_age: Duration) {
        let before_count = self.flows.read().await.len();
        let mut w = self.flows.write().await;
        w.retain(|_, f| f.created_at.elapsed() < max_age);
        let after_count = w.len();
        let removed = before_count - after_count;

        if removed > 0 {
            info!(removed_flows=%removed, max_age_secs=%max_age.as_secs(), "cleaned up expired OIDC authentication flows");
        } else {
            debug!(active_flows=%after_count, "no expired OIDC authentication flows to clean up");
        }
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

// random_bytes removed — not used anywhere in the codebase
