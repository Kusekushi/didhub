use std::env;
use std::sync::{Mutex, OnceLock};

static ENV_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

pub fn with_env_lock<F, R>(f: F) -> R
where
    F: FnOnce() -> R,
{
    let _guard = ENV_LOCK.get_or_init(|| Mutex::new(())).lock().unwrap();
    reset_env();
    f()
}

pub fn reset_env() {
    for key in [
        "ALLOW_ALL_FRONTEND_ORIGINS",
        "LOG_FORMAT",
        "LOG_LEVEL",
        "RUST_LOG",
        "UPLOAD_DIR",
        "DIDHUB_DB",
        "DIDHUB_DB_CONFIG",
        "DIDHUB_CONFIG_FILE",
        "FRONTEND_BASE_URL",
    ] {
        env::remove_var(key);
    }
}
