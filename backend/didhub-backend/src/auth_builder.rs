use std::sync::Arc;

use sha2::{Digest, Sha256};
use simple_asn1::{from_der, ASN1Block};

/// Metadata about an authentication key for logging purposes.
pub struct AuthKeyInfo {
    pub mode: String,
    pub fingerprint: Option<String>,
    pub key_type: Option<String>,
    pub bits: Option<usize>,
}

/// Result of building an authenticator: the trait object and associated metadata.
pub type AuthResult = Result<(Arc<dyn didhub_auth::AuthenticatorTrait>, AuthKeyInfo), String>;

/// Build authenticator from config.
///
/// Tries JWT_PEM (inline), JWT_PEM_PATH (file), then JWT_SECRET in order.
pub fn build_authenticator_from_config(cfg: &didhub_config::Config) -> AuthResult {
    // Try inline PEM first
    if let Some(ref pem_inline) = cfg.auth.jwt_pem {
        return build_rs256_auth(pem_inline.clone(), "RS256(inline)".into());
    }

    // Try PEM from file path
    if let Some(ref pem_path) = cfg.auth.jwt_pem_path {
        let pem_content = std::fs::read_to_string(pem_path)
            .map_err(|e| format!("failed to read JWT_PEM_PATH '{pem_path}': {e}"))?;
        return build_rs256_auth(pem_content, format!("RS256(path={pem_path})"));
    }

    // Try HS256 secret
    if let Some(ref secret) = cfg.auth.jwt_secret {
        let fingerprint = compute_fingerprint(secret.as_bytes());
        let auth = didhub_auth::JwtAuthenticator::new_hs256(secret.clone());
        return Ok((
            Arc::from(Box::new(auth) as Box<dyn didhub_auth::AuthenticatorTrait>),
            AuthKeyInfo {
                mode: "HS256(secret)".into(),
                fingerprint,
                key_type: Some("HS256".into()),
                bits: Some(secret.len() * 8),
            },
        ));
    }

    Err(
        "no JWT configuration found: set JWT_PEM (inline) or JWT_PEM_PATH (file) or JWT_SECRET"
            .into(),
    )
}

/// Build RS256 authenticator from PEM content string.
fn build_rs256_auth(pem_content: String, mode: String) -> AuthResult {
    let pem_parsed =
        pem::parse(pem_content.as_bytes()).map_err(|e| format!("failed to parse PEM: {e}"))?;

    let fingerprint = compute_fingerprint(pem_parsed.contents());
    let (key_type, bits) = extract_key_info(pem_parsed.contents());
    let auth = didhub_auth::JwtAuthenticator::new_rs256(pem_content);

    Ok((
        Arc::from(Box::new(auth) as Box<dyn didhub_auth::AuthenticatorTrait>),
        AuthKeyInfo {
            mode,
            fingerprint,
            key_type,
            bits,
        },
    ))
}

/// Compute SHA256 fingerprint (first 12 hex chars) of raw bytes.
fn compute_fingerprint(data: &[u8]) -> Option<String> {
    let digest = Sha256::digest(data);
    hex::encode(digest).get(..12).map(|s| s.to_string())
}

/// Extract key type and bit size from PEM contents.
fn extract_key_info(contents: &[u8]) -> (Option<String>, Option<usize>) {
    match der_rsa_modulus_bits(contents) {
        Some(bits) => (Some("RSA".into()), Some(bits as usize)),
        None => (Some("UNKNOWN".into()), None),
    }
}

/// Inspect DER bytes and attempt to extract RSA modulus size (bits).
/// Handles both raw PKCS#1 RSAPublicKey and SubjectPublicKeyInfo.
fn der_rsa_modulus_bits(der: &[u8]) -> Option<u32> {
    if let Ok(blocks) = from_der(der) {
        for blk in &blocks {
            if let Some(bits) = find_rsa_modulus_in_block(blk) {
                return Some(bits);
            }
        }
    }
    None
}

fn find_rsa_modulus_in_block(block: &ASN1Block) -> Option<u32> {
    match block {
        ASN1Block::Sequence(_, items) => {
            // PKCS#1 RSAPublicKey is Sequence { modulus INTEGER, exponent INTEGER }
            if !items.is_empty() {
                if let ASN1Block::Integer(_, ref bigint) = &items[0] {
                    let (_sign, bytes) = bigint.to_bytes_be();
                    if !bytes.is_empty() {
                        let leading = bytes[0].leading_zeros();
                        let bits = (bytes.len() * 8) as u32 - leading;
                        return Some(bits);
                    }
                }
            }
            // Recurse into nested sequences
            for it in items {
                if let Some(b) = find_rsa_modulus_in_block(it) {
                    return Some(b);
                }
            }
            None
        }
        _ => None,
    }
}
