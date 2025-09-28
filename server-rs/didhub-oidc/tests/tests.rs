use didhub_oidc::{ProviderSettings, OidcState, ProviderConfig};
use std::env;

#[test]
fn test_provider_settings_from_env_no_env_vars() {
    // Clear any existing env vars that might affect the test
    env::remove_var("GOOGLE_OIDC_CLIENT_ID");
    env::remove_var("GOOGLE_OIDC_CLIENT_SECRET");
    env::remove_var("DISCORD_OIDC_CLIENT_ID");
    env::remove_var("DISCORD_OIDC_CLIENT_SECRET");
    env::remove_var("OIDC_REDIRECT_URI");

    let settings = ProviderSettings::from_env();

    // Should have providers but they should be disabled
    assert!(settings.providers.contains_key("google"));
    assert!(settings.providers.contains_key("discord"));

    let google = settings.providers.get("google").unwrap();
    assert!(!google.enabled);
    assert_eq!(google.client_id, "CHANGE_ME_GOOGLE_CLIENT_ID");

    let discord = settings.providers.get("discord").unwrap();
    assert!(!discord.enabled);
    assert_eq!(discord.client_id, "CHANGE_ME_DISCORD_CLIENT_ID");

    assert_eq!(settings.redirect_uri, "http://localhost:5173/oidc/callback");
}

#[test]
fn test_provider_settings_get() {
    let settings = ProviderSettings::from_env();

    let google = settings.get("google");
    assert!(google.is_some());
    assert_eq!(google.unwrap().id, "google");

    let discord = settings.get("discord");
    assert!(discord.is_some());
    assert_eq!(discord.unwrap().id, "discord");

    let nonexistent = settings.get("nonexistent");
    assert!(nonexistent.is_none());
}

#[test]
fn test_provider_config_structure() {
    let config = ProviderConfig {
        id: "test".to_string(),
        name: Some("Test Provider".to_string()),
        issuer: "https://test.com".to_string(),
        client_id: "test_client_id".to_string(),
        client_secret: Some("test_secret".to_string()),
        scopes: Some(vec!["openid".to_string(), "email".to_string()]),
        enabled: true,
        allow_signup: Some(true),
    };

    assert_eq!(config.id, "test");
    assert_eq!(config.name, Some("Test Provider".to_string()));
    assert_eq!(config.issuer, "https://test.com");
    assert_eq!(config.client_id, "test_client_id");
    assert_eq!(config.client_secret, Some("test_secret".to_string()));
    assert_eq!(config.scopes, Some(vec!["openid".to_string(), "email".to_string()]));
    assert!(config.enabled);
    assert_eq!(config.allow_signup, Some(true));
}

#[tokio::test]
async fn test_oidc_state_new() {
    let state = OidcState::new();

    // Should initialize with empty maps
    // We can't directly test the internal state, but we can test that the methods work
    let discovery = state.get_discovery("test").await;
    assert!(discovery.is_none());
}