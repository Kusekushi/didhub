#![cfg(feature = "oidc_integration_tests")]
use hyper::{Server, Body, Request, Response, Method};
use hyper::service::{make_service_fn, service_fn};
use std::convert::Infallible;
use std::net::TcpListener;
use didhub_server::{routes_oidc, oidc as oidc_mod, db::Db, auth::CurrentUser};
use std::collections::HashMap;
use axum::response::IntoResponse;
use std::sync::Arc;
use didhub_server::routes_oidc::AuthorizeQuery;
use rsa::{RsaPrivateKey, RsaPublicKey};
use rsa::pkcs8::EncodePrivateKey;
use rsa::traits::PublicKeyParts;
use rand::rngs::OsRng;
use jsonwebtoken::{EncodingKey, Header};
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;

async fn start_mock_provider() -> (String, tokio::task::JoinHandle<()>) {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let addr = listener.local_addr().unwrap();
    let base = format!("http://{}", addr);
    let base_arc = Arc::new(base.clone());

    // Generate an RSA keypair for signing ID tokens
    let mut rng = OsRng;
    let priv_key = RsaPrivateKey::new(&mut rng, 2048).expect("generate rsa");
    let pub_key = RsaPublicKey::from(&priv_key);
    let priv_pem = priv_key.to_pkcs8_pem(Default::default()).expect("pem").to_string();
    let pub_key = std::sync::Arc::new(pub_key);
    let priv_pem = std::sync::Arc::new(priv_pem);

    let make_svc = make_service_fn(move |_| {
        let base = base_arc.clone();
        let pub_key = pub_key.clone();
        let priv_pem = priv_pem.clone();
        async move {
            Ok::<_, Infallible>(service_fn(move |req: Request<Body>| {
                let base = base.clone();
                let pub_key = pub_key.clone();
                let priv_pem = priv_pem.clone();
                async move {
                    let path = req.uri().path();
                    let method = req.method();
                    let resp = match (method, path) {
                        (&Method::GET, "/.well-known/openid-configuration") => {
                            let discovery = serde_json::json!({
                                "issuer": base,
                                "authorization_endpoint": format!("{}/authorize", base),
                                "token_endpoint": format!("{}/token", base),
                                "jwks_uri": format!("{}/jwks", base),
                                "response_types_supported": ["code"],
                                "subject_types_supported": ["public"],
                                "id_token_signing_alg_values_supported": ["RS256"],
                                "token_endpoint_auth_methods_supported": ["client_secret_basic"],
                                "scopes_supported": ["openid","email","profile"],
                                "grant_types_supported": ["authorization_code"],
                                "claims_supported": ["sub","email","name"]
                            });
                            Response::builder().status(200).header("content-type","application/json").body(Body::from(serde_json::to_string(&discovery).unwrap())).unwrap()
                        }
                        (&Method::GET, "/jwks") => {
                            // rcgen exposes the public key as DER in the certificate
                            // We'll parse the cert to extract the RSA modulus and exponent for a minimal JWK.
                            let n = URL_SAFE_NO_PAD.encode(pub_key.n().to_bytes_be());
                            let e = URL_SAFE_NO_PAD.encode(pub_key.e().to_bytes_be());
                            let jwk = serde_json::json!({"keys":[{"kty":"RSA","alg":"RS256","use":"sig","n": n, "e": e, "kid": "testkey1"}]});
                            Response::builder().status(200).header("content-type","application/json").body(Body::from(serde_json::to_string(&jwk).unwrap())).unwrap()
                        }
                        (&Method::POST, "/token") => {
                            // Return a signed ID token (RS256) using the generated private key
                            let now = chrono::Utc::now().timestamp() as usize;
                            let claims = serde_json::json!({
                                "iss": base.to_string(),
                                "sub": "test-subject",
                                "aud": "test-google-client",
                                "exp": now + 3600,
                                "iat": now,
                                "nonce": "",
                                "email": "tester@example.com",
                                "name": "Tester"
                            });
                            // Sign using the private key (PKCS8 PEM) via jsonwebtoken
                            let encoding_key = EncodingKey::from_rsa_pem(priv_pem.as_bytes()).unwrap_or_else(|_| EncodingKey::from_secret(b"fallback"));
                            let token = jsonwebtoken::encode(&Header::new(jsonwebtoken::Algorithm::RS256), &claims, &encoding_key).unwrap_or_else(|_| "".into());
                            let body = serde_json::json!({"access_token":"atoken","id_token": token,"token_type":"Bearer","expires_in":3600});
                            Response::builder().status(200).header("content-type","application/json").body(Body::from(serde_json::to_string(&body).unwrap())).unwrap()
                        }
                        _ => Response::builder().status(404).body(Body::from("not found")).unwrap(),
                    };
                    Ok::<_, Infallible>(resp)
                }
            }))
        }
    });

    let server = Server::from_tcp(listener).unwrap().serve(make_svc);
    let handle = tokio::spawn(async move { let _ = server.await; });
    (base, handle)
}

#[tokio::test]
async fn test_google_authorize_integration() {
    let (base, handle) = start_mock_provider().await;

    let tmp = std::env::temp_dir().join(format!("didhub_test_{}.sqlite", rand::random::<u32>()));
    if tmp.exists() { let _ = std::fs::remove_file(&tmp); }
    if let Some(p) = tmp.parent() { std::fs::create_dir_all(p).ok(); }
    let _ = std::fs::OpenOptions::new().create(true).write(true).open(&tmp).expect("create sqlite file");
    sqlx::any::install_default_drivers();
    if std::path::Path::new(tmp.as_ref()).exists() { let _ = std::fs::remove_file(tmp.as_ref()); }
    if let Some(p) = tmp.as_ref().parent() { std::fs::create_dir_all(p).ok(); }
    let _ = std::fs::OpenOptions::new().create(true).write(true).open(tmp.as_ref()).expect("create sqlite file");
    sqlx::any::install_default_drivers();
    let db = Db::connect_with_file(tmp.to_string_lossy().as_ref()).await.expect("db connect");

    let mut providers = HashMap::new();
    providers.insert("google".to_string(), oidc_mod::ProviderConfig {
        id: "google".to_string(),
        name: Some("Google".to_string()),
        issuer: base.clone(),
        client_id: "test-google-client".to_string(),
        client_secret: None,
        scopes: Some(vec!["openid".into(), "email".into(), "profile".into()]),
        enabled: true,
        allow_signup: Some(true),
    });
    let settings = oidc_mod::ProviderSettings { providers, redirect_uri: "http://localhost/oidc/callback".into() };
    let ostate = oidc_mod::OidcState::new();

    let fake_user = CurrentUser { id: 1, username: "tester".into(), avatar: None, is_admin: true, is_system: false, is_approved: true, must_change_password: false };

    // Try discovery explicitly to show any underlying error
    let http_client = openidconnect::reqwest::ClientBuilder::new().redirect(reqwest::redirect::Policy::none()).build().expect("build http client");
    let issuer = openidconnect::IssuerUrl::new(base.clone()).expect("issuer url");
    match openidconnect::core::CoreProviderMetadata::discover_async(issuer, &http_client).await {
        Ok(_) => (),
        Err(e) => panic!("discovery failed: {:?}", e),
    }

    let path = axum::extract::Path("google".to_string());
    let q = axum::extract::Query(AuthorizeQuery { redirect: None });
    let res = match routes_oidc::authorize(path, q, axum::Extension(fake_user.clone()), axum::Extension(db.clone()), axum::Extension(ostate.clone()), axum::Extension(settings.clone())).await {
        Ok(r) => r,
        Err(e) => panic!("authorize returned error: {:?}", e),
    };
    let http_resp = IntoResponse::into_response(res);
    let loc = http_resp.headers().get("location").expect("location header").to_str().unwrap().to_string();
    assert!(loc.contains("access_type=offline"), "google authorize should include access_type=offline");

    let url = url::Url::parse(&loc).expect("parse redirect url");
    let state = url.query_pairs().find(|(k, _)| k == "state").map(|(_, v)| v.to_string()).expect("state present");
    let flow = ostate.take_flow(&state).await;
    assert!(flow.is_some(), "flow should be present for state");

    handle.abort();
}

#[tokio::test]
async fn test_discord_authorize_integration() {
    let (base, handle) = start_mock_provider().await;

    let tmp = std::env::temp_dir().join(format!("didhub_test_{}.sqlite", rand::random::<u32>()));
    if tmp.exists() { let _ = std::fs::remove_file(&tmp); }
    if let Some(p) = tmp.parent() { std::fs::create_dir_all(p).ok(); }
    let _ = std::fs::OpenOptions::new().create(true).write(true).open(&tmp).expect("create sqlite file");
    sqlx::any::install_default_drivers();
    if std::path::Path::new(tmp.as_ref()).exists() { let _ = std::fs::remove_file(tmp.as_ref()); }
    if let Some(p) = tmp.as_ref().parent() { std::fs::create_dir_all(p).ok(); }
    let _ = std::fs::OpenOptions::new().create(true).write(true).open(tmp.as_ref()).expect("create sqlite file");
    sqlx::any::install_default_drivers();
    let db = Db::connect_with_file(tmp.to_string_lossy().as_ref()).await.expect("db connect");

    let mut providers = HashMap::new();
    providers.insert("discord".to_string(), oidc_mod::ProviderConfig {
        id: "discord".to_string(),
        name: Some("Discord".to_string()),
        issuer: base.clone(),
        client_id: "test-discord-client".to_string(),
        client_secret: None,
        scopes: Some(vec!["openid".into(), "identify".into(), "email".into()]),
        enabled: true,
        allow_signup: Some(true),
    });
    let settings = oidc_mod::ProviderSettings { providers, redirect_uri: "http://localhost/oidc/callback".into() };
    let ostate = oidc_mod::OidcState::new();
    let fake_user = CurrentUser { id: 1, username: "tester".into(), avatar: None, is_admin: true, is_system: false, is_approved: true, must_change_password: false };

    // Try discovery explicitly to show any underlying error
    let http_client = openidconnect::reqwest::ClientBuilder::new().redirect(reqwest::redirect::Policy::none()).build().expect("build http client");
    let issuer = openidconnect::IssuerUrl::new(base.clone()).expect("issuer url");
    match openidconnect::core::CoreProviderMetadata::discover_async(issuer, &http_client).await {
        Ok(_) => (),
        Err(e) => panic!("discovery failed: {:?}", e),
    }

    let path = axum::extract::Path("discord".to_string());
    let q = axum::extract::Query(AuthorizeQuery { redirect: None });
    let res = match routes_oidc::authorize(path, q, axum::Extension(fake_user.clone()), axum::Extension(db.clone()), axum::Extension(ostate.clone()), axum::Extension(settings.clone())).await {
        Ok(r) => r,
        Err(e) => panic!("authorize returned error: {:?}", e),
    };
    let http_resp = IntoResponse::into_response(res);
    let loc = http_resp.headers().get("location").expect("location header").to_str().unwrap().to_string();
    assert!(!loc.contains("access_type=offline"), "discord authorize should not include access_type=offline");

    let url = url::Url::parse(&loc).expect("parse redirect url");
    let state = url.query_pairs().find(|(k, _)| k == "state").map(|(_, v)| v.to_string()).expect("state present");
    let flow = ostate.take_flow(&state).await;
    assert!(flow.is_some(), "flow should be present for state");

    handle.abort();
}


