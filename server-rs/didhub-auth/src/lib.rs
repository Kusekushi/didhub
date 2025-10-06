pub mod handlers;
pub mod middleware;
pub mod utils;

use axum::extract::FromRef;
use didhub_cache::AppCache;
use didhub_config::AppConfig;
use didhub_db::Db;

// Re-export commonly used types and functions
pub use handlers::*;
pub use middleware::*;
pub use utils::*;

#[derive(Clone)]
pub struct AuthState {
    pub db: Db,
    pub cfg: AppConfig,
    pub cache: AppCache,
}

impl FromRef<AuthState> for Db {
    fn from_ref(s: &AuthState) -> Db {
        s.db.clone()
    }
}
impl FromRef<AuthState> for AppConfig {
    fn from_ref(s: &AuthState) -> AppConfig {
        s.cfg.clone()
    }
}
impl FromRef<AuthState> for AppCache {
    fn from_ref(s: &AuthState) -> AppCache {
        s.cache.clone()
    }
}
