//! Lightweight authentication facade used by the backend service.
//!
//! Provides:
//! - JWT token verification (HS256/RS256)
//! - Password hashing with Argon2id
//! - Client-side hash validation (for pre-hashed passwords from frontend)
//! - Authentication context and error types

pub mod auth;

pub use auth::*;
