pub use crate::auth::context::PasswordError;
use argon2::{
    password_hash::{
        rand_core::OsRng, PasswordHash, PasswordHasher as Argon2PasswordHasher, PasswordVerifier,
        SaltString,
    },
    Argon2,
};
use sha2::{Digest, Sha256};

// ============================================================================
// Password Hashing
// ============================================================================

/// Password hasher using Argon2id (the recommended variant for password hashing).
#[derive(Debug, Clone)]
pub struct Argon2Hasher {
    /// Memory cost in KiB (default: 19456 = 19 MiB)
    m_cost: u32,
    /// Time cost / iterations (default: 2)
    t_cost: u32,
    /// Parallelism factor (default: 1)
    p_cost: u32,
}

impl Default for Argon2Hasher {
    fn default() -> Self {
        // OWASP recommended minimum parameters for Argon2id
        Self {
            m_cost: 19456, // 19 MiB
            t_cost: 2,
            p_cost: 1,
        }
    }
}

impl Argon2Hasher {
    pub fn new() -> Self {
        Self::default()
    }

    /// Configure memory cost in KiB.
    pub fn with_memory_cost(mut self, kib: u32) -> Self {
        self.m_cost = kib;
        self
    }

    /// Configure time cost (iterations).
    pub fn with_time_cost(mut self, iterations: u32) -> Self {
        self.t_cost = iterations;
        self
    }

    /// Configure parallelism factor.
    pub fn with_parallelism(mut self, threads: u32) -> Self {
        self.p_cost = threads;
        self
    }

    fn argon2(&self) -> Argon2<'_> {
        Argon2::new(
            argon2::Algorithm::Argon2id,
            argon2::Version::V0x13,
            argon2::Params::new(self.m_cost, self.t_cost, self.p_cost, None)
                .expect("valid argon2 params"),
        )
    }

    /// Hash a password, returning the PHC-format hash string.
    pub fn hash(&self, password: &str) -> Result<String, PasswordError> {
        let salt = SaltString::generate(&mut OsRng);
        let argon2 = self.argon2();

        argon2
            .hash_password(password.as_bytes(), &salt)
            .map(|h| h.to_string())
            .map_err(|e| PasswordError::HashingFailed(e.to_string()))
    }

    /// Hash a client-side pre-hashed password.
    pub fn hash_client_prehash(&self, client_hash: &str) -> Result<String, PasswordError> {
        validate_client_hash(client_hash)?;
        self.hash(client_hash)
    }

    /// Verify a password against a stored PHC-format hash.
    pub fn verify(&self, password: &str, stored_hash: &str) -> Result<(), PasswordError> {
        let parsed =
            PasswordHash::new(stored_hash).map_err(|_| PasswordError::InvalidHashFormat)?;

        self.argon2()
            .verify_password(password.as_bytes(), &parsed)
            .map_err(|_| PasswordError::VerificationFailed)
    }

    /// Verify a client-side pre-hashed password against a stored hash.
    pub fn verify_client_prehash(
        &self,
        client_hash: &str,
        stored_hash: &str,
    ) -> Result<(), PasswordError> {
        validate_client_hash(client_hash)?;
        self.verify(client_hash, stored_hash)
    }
}

// ============================================================================
// Client Hash Utilities
// ============================================================================

/// Expected length of a SHA-256 hex-encoded hash.
pub const CLIENT_HASH_LENGTH: usize = 64;

/// Validate that a client-provided hash is a valid 64-character hex string.
#[inline]
pub fn validate_client_hash(hash: &str) -> Result<(), PasswordError> {
    if hash.len() != CLIENT_HASH_LENGTH {
        return Err(PasswordError::InvalidClientHash);
    }
    if !hash.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err(PasswordError::InvalidClientHash);
    }
    Ok(())
}

/// Check if a string looks like a client-side SHA-256 hash (64 hex chars).
#[inline]
pub fn is_client_hash(input: &str) -> bool {
    input.len() == CLIENT_HASH_LENGTH && input.chars().all(|c| c.is_ascii_hexdigit())
}

/// Compute SHA-256 hash of input and return as lowercase hex string.
pub fn sha256_hex(input: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(input.as_bytes());
    hex::encode(hasher.finalize())
}

// ============================================================================
// Convenience Functions
// ============================================================================

/// Hash a password using default Argon2id parameters.
#[inline]
pub fn hash_password(password: &str) -> Result<String, PasswordError> {
    Argon2Hasher::new().hash(password)
}

/// Hash a client pre-hashed password using default Argon2id parameters.
#[inline]
pub fn hash_client_password(client_hash: &str) -> Result<String, PasswordError> {
    Argon2Hasher::new().hash_client_prehash(client_hash)
}

/// Verify a password against a stored hash using default parameters.
#[inline]
pub fn verify_password(password: &str, stored_hash: &str) -> Result<(), PasswordError> {
    Argon2Hasher::new().verify(password, stored_hash)
}

/// Verify a client pre-hashed password against a stored hash.
#[inline]
pub fn verify_client_password(client_hash: &str, stored_hash: &str) -> Result<(), PasswordError> {
    Argon2Hasher::new().verify_client_prehash(client_hash, stored_hash)
}
