use didhub_db::settings::SettingOperations;
use didhub_db::Db;
use once_cell::sync::OnceCell;
use std::{
    env, io,
    path::PathBuf,
    sync::Arc,
    time::{Duration, Instant},
};
use tokio::sync::RwLock;
use tracing::{debug, error, info, warn};

#[derive(Clone)]
pub struct UploadDirCache {
    inner: Arc<RwLock<State>>,
    ttl: Arc<RwLock<Duration>>,
    default: String,
    db: Option<Db>,
}
struct State {
    value: String,
    last_value: Option<String>,
    fetched_at: Instant,
    last_failure: Option<String>,
}

impl UploadDirCache {
    pub fn new(db: Db, default: String, ttl_secs: u64) -> Self {
        Self {
            inner: Arc::new(RwLock::new(State {
                value: default.clone(),
                last_value: None,
                fetched_at: Instant::now(),
                last_failure: None,
            })),
            ttl: Arc::new(RwLock::new(Duration::from_secs(ttl_secs))),
            default,
            db: Some(db),
        }
    }

    /// Create an UploadDirCache without a database (test helper)
    pub fn new_no_db(default: String, ttl_secs: u64) -> Self {
        Self {
            inner: Arc::new(RwLock::new(State {
                value: default.clone(),
                last_value: None,
                fetched_at: Instant::now(),
                last_failure: None,
            })),
            ttl: Arc::new(RwLock::new(Duration::from_secs(ttl_secs))),
            default,
            db: None,
        }
    }
    pub async fn current(&self) -> String {
        {
            let g = self.inner.read().await;
            let ttl = *self.ttl.read().await;
            if g.fetched_at.elapsed() < ttl {
                debug!(cached_value=%g.value, ttl_secs=%ttl.as_secs(), "upload directory cache hit");
                return g.value.clone();
            }
        }
        let mut w = self.inner.write().await;
        let ttl = *self.ttl.read().await;
        if w.fetched_at.elapsed() < ttl {
            debug!(cached_value=%w.value, ttl_secs=%ttl.as_secs(), "upload directory cache hit (write lock)");
            return w.value.clone();
        }

        debug!("upload directory cache miss - fetching from database");
        let raw_val = if let Some(db) = &self.db {
            db.get_setting("app.upload_dir")
                .await
                .ok()
                .flatten()
                .map(|s| s.value)
                .unwrap_or_else(|| self.default.clone())
        } else {
            self.default.clone()
        };

        let mut new_val = raw_val.trim().to_string();
        if new_val.is_empty() {
            new_val = self.default.clone();
        }

        if let Some(failed) = w.last_failure.as_ref() {
            if failed == &new_val {
                warn!(failed_value=%new_val, active_directory=%w.value, "upload directory setting unresolved - retaining current directory");
                w.fetched_at = Instant::now();
                return w.value.clone();
            }
        }

        let changed = w.value != new_val;
        if changed {
            info!(old_value=%w.value, new_value=%new_val, "upload directory changed");
            w.last_value = Some(w.value.clone());
        } else {
            debug!(value=%new_val, "upload directory unchanged");
        }

        w.value = new_val.clone();
        w.last_failure = None;
        w.fetched_at = Instant::now();

        // Refresh TTL from DB setting `uploads.upload_dir_cache.ttl_secs` if present.
        if let Some(db) = &self.db {
            if let Ok(Some(s)) = db.get_setting("uploads.upload_dir_cache.ttl_secs").await {
                if let Ok(secs) = s.value.trim().parse::<u64>() {
                    let mut ttl_w = self.ttl.write().await;
                    *ttl_w = Duration::from_secs(secs);
                    debug!(new_ttl_secs=%secs, "updated cache TTL from database");
                }
            }
        }

        new_val
    }
    pub async fn invalidate(&self) {
        let mut w = self.inner.write().await;
        let ttl = *self.ttl.read().await;
        w.fetched_at = Instant::now() - ttl - Duration::from_secs(1);
        w.last_failure = None;
        debug!("upload directory cache invalidated");
    }
    pub async fn ensure_dir(&self) -> std::io::Result<PathBuf> {
        let current_value = self.current().await;
        let path = PathBuf::from(&current_value);

        if path.exists() {
            if path.is_dir() {
                debug!(directory=%path.display(), "upload directory already exists");
                let mut w = self.inner.write().await;
                w.last_failure = None;
                return Ok(path);
            } else {
                warn!(directory=%path.display(), "upload directory path exists but is not a directory");
                let mut w = self.inner.write().await;
                w.last_failure = Some(current_value.clone());
                return Err(io::Error::new(
                    io::ErrorKind::AlreadyExists,
                    "upload path is not a directory",
                ));
            }
        }

        info!(directory=%path.display(), "creating upload directory");
        match tokio::fs::create_dir_all(&path).await {
            Ok(_) => {
                let mut w = self.inner.write().await;
                w.last_failure = None;
                Ok(path)
            }
            Err(err) => {
                warn!(directory=%path.display(), source=%err, "failed to create upload directory");
                let fallback = resolve_fallback_upload_path();
                if fallback != path {
                    if let Err(fallback_err) = tokio::fs::create_dir_all(&fallback).await {
                        error!(fallback_directory=%fallback.display(), source=%fallback_err, "failed to create fallback upload directory");
                        let mut w = self.inner.write().await;
                        w.last_failure = Some(current_value.clone());
                        return Err(err);
                    }

                    let fallback_str = fallback.to_string_lossy().to_string();
                    {
                        let mut w = self.inner.write().await;
                        w.last_failure = Some(current_value.clone());
                        if w.value != fallback_str {
                            w.last_value = Some(w.value.clone());
                        }
                        w.value = fallback_str.clone();
                        w.fetched_at = Instant::now();
                    }
                    warn!(original_directory=%path.display(), fallback_directory=%fallback.display(), "falling back to writable upload directory");
                    warn!("Set `app.upload_dir` to a writable location to remove the fallback.");
                    return Ok(fallback);
                }

                let mut w = self.inner.write().await;
                w.last_failure = Some(current_value.clone());
                Err(err)
            }
        }
    }
    pub async fn migrate_previous_to_current(&self) -> Result<(usize, usize), std::io::Error> {
        let (from, to) = {
            let w = self.inner.read().await;
            (w.last_value.clone(), w.value.clone())
        };
        let mut moved = 0usize;
        let mut skipped = 0usize;

        if let Some(from_dir) = from {
            if from_dir == to {
                debug!(directory=%to, "no migration needed - directories are the same");
                return Ok((0, 0));
            }

            info!(from_directory=%from_dir, to_directory=%to, "starting upload directory migration");

            let from_pb = PathBuf::from(&from_dir);
            let to_pb = PathBuf::from(&to);

            if !from_pb.exists() {
                warn!(from_directory=%from_dir, "source directory does not exist - skipping migration");
                return Ok((0, 0));
            }

            debug!(to_directory=%to_pb.display(), "ensuring destination directory exists");
            tokio::fs::create_dir_all(&to_pb).await?;

            let mut rd = tokio::fs::read_dir(&from_pb).await?;
            while let Some(ent) = rd.next_entry().await? {
                if let Ok(meta) = ent.metadata().await {
                    if !meta.is_file() {
                        debug!(path=%ent.path().display(), "skipping non-file entry");
                        skipped += 1;
                        continue;
                    }
                }

                if let Some(name) = ent.file_name().to_str().map(|s| s.to_string()) {
                    let src = from_pb.join(&name);
                    let dst = to_pb.join(&name);

                    if tokio::fs::rename(&src, &dst).await.is_ok() {
                        debug!(filename=%name, "moved file via rename");
                        moved += 1;
                    } else {
                        if tokio::fs::copy(&src, &dst).await.is_ok() {
                            let _ = tokio::fs::remove_file(&src).await;
                            debug!(filename=%name, "moved file via copy+delete");
                            moved += 1;
                        } else {
                            warn!(filename=%name, "failed to move file");
                            skipped += 1;
                        }
                    }
                }
            }

            info!(moved_files=%moved, skipped_files=%skipped, from=%from_dir, to=%to, "upload directory migration completed");
        } else {
            debug!("no previous directory to migrate from");
        }

        Ok((moved, skipped))
    }

    /// Refresh the TTL from the database setting `uploads.upload_dir_cache.ttl_secs`.
    pub async fn refresh_ttl_from_db(&self) {
        if let Some(db) = &self.db {
            if let Ok(Some(s)) = db.get_setting("uploads.upload_dir_cache.ttl_secs").await {
                if let Ok(secs) = s.value.trim().parse::<u64>() {
                    let mut ttl_w = self.ttl.write().await;
                    *ttl_w = Duration::from_secs(secs);
                    debug!(new_ttl_secs=%secs, "refreshed cache TTL from database setting");
                } else {
                    warn!(setting_value=%s.value, "invalid TTL value in database setting");
                }
            } else {
                debug!("no TTL setting found in database, keeping current value");
            }
        } else {
            debug!("no database connection available for TTL refresh");
        }
    }

    // Test helpers: expose TTL and allow setting internal state for tests
    pub async fn get_ttl_secs(&self) -> u64 {
        (*self.ttl.read().await).as_secs()
    }

    pub async fn set_internal_state(&self, last: Option<String>, val: String) {
        let mut w = self.inner.write().await;
        w.last_value = last;
        w.value = val;
        w.last_failure = None;
    }

    /// Set TTL (seconds) programmatically.
    pub async fn set_ttl_secs(&self, secs: u64) {
        let mut ttl_w = self.ttl.write().await;
        *ttl_w = Duration::from_secs(secs);
    }
}

fn resolve_fallback_upload_path() -> PathBuf {
    if let Ok(custom) = env::var("DIDHUB_UPLOAD_FALLBACK_DIR") {
        let trimmed = custom.trim();
        if !trimmed.is_empty() {
            return PathBuf::from(trimmed);
        }
    }

    let mut fallback = env::temp_dir();
    fallback.push("didhub");
    fallback.push("uploads");
    fallback
}

static GLOBAL: OnceCell<UploadDirCache> = OnceCell::new();
pub fn set_global(cache: UploadDirCache) {
    match GLOBAL.set(cache) {
        Ok(_) => debug!("global upload directory cache initialized"),
        Err(_) => warn!("global upload directory cache already initialized"),
    }
}
pub fn global() -> Option<&'static UploadDirCache> {
    GLOBAL.get()
}
