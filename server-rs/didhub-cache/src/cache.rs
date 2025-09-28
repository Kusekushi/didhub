use anyhow::Result;
use dashmap::DashMap;
use redis::aio::MultiplexedConnection;
use serde::{de::DeserializeOwned, Serialize};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::Mutex;
use tracing::trace;
pub type RedisManager = Arc<Mutex<MultiplexedConnection>>;

#[derive(Clone)]
pub enum CacheBackend {
    Memory(MemoryCache),
    Redis(RedisManager),
}

#[derive(Clone)]
pub struct MemoryEntry {
    pub value: Vec<u8>,
    pub expires_at: Option<Instant>,
}

#[derive(Clone, Default)]
pub struct MemoryCache {
    inner: std::sync::Arc<DashMap<String, MemoryEntry>>,
}

impl MemoryCache {
    pub fn new() -> Self {
        Self {
            inner: std::sync::Arc::new(DashMap::new()),
        }
    }
    pub fn cleanup(&self) {
        // lazy cleanup
        let now = Instant::now();
        let to_remove: Vec<String> = self
            .inner
            .iter()
            .filter_map(|kv| {
                if let Some(exp) = kv.expires_at {
                    if exp <= now {
                        return Some(kv.key().clone());
                    }
                }
                None
            })
            .collect();
        for k in to_remove {
            self.inner.remove(&k);
        }
    }
    pub fn set_raw(&self, key: &str, val: Vec<u8>, ttl: Option<Duration>) {
        let expires_at = ttl.map(|d| Instant::now() + d);
        self.inner.insert(
            key.to_string(),
            MemoryEntry {
                value: val,
                expires_at,
            },
        );
    }
    pub fn get_raw(&self, key: &str) -> Option<Vec<u8>> {
        self.cleanup();
        self.inner.get(key).map(|v| v.value.clone())
    }
    pub fn del(&self, key: &str) {
        self.inner.remove(key);
    }
}

#[async_trait::async_trait]
pub trait Cache: Send + Sync + Clone + 'static {
    async fn set<T: Serialize + Send + Sync>(
        &self,
        key: &str,
        value: &T,
        ttl: Option<Duration>,
    ) -> Result<()>;
    async fn get<T: DeserializeOwned + Send + Sync>(&self, key: &str) -> Result<Option<T>>;
    async fn del(&self, key: &str) -> Result<()>;
    async fn incr(&self, key: &str, ttl: Option<Duration>) -> Result<i64>;
    async fn del_prefix(&self, prefix: &str) -> Result<()>;
}

#[derive(Clone)]
pub struct AppCache {
    backend: CacheBackend,
}

impl AppCache {
    pub fn memory() -> Self {
        Self {
            backend: CacheBackend::Memory(MemoryCache::new()),
        }
    }
    pub fn redis(manager: RedisManager) -> Self {
        Self {
            backend: CacheBackend::Redis(manager),
        }
    }
}
impl AppCache {
    pub fn backend_kind(&self) -> &'static str {
        match self.backend {
            CacheBackend::Memory(_) => "memory",
            CacheBackend::Redis(_) => "redis",
        }
    }
    pub fn as_redis_manager(&self) -> Option<RedisManager> {
        match &self.backend {
            CacheBackend::Redis(m) => Some(m.clone()),
            _ => None,
        }
    }
}

#[async_trait::async_trait]
impl Cache for AppCache {
    async fn set<T: Serialize + Send + Sync>(
        &self,
        key: &str,
        value: &T,
        ttl: Option<Duration>,
    ) -> Result<()> {
        trace!(key=%key, ttl=?ttl, backend=%self.backend_kind(), "cache set operation");
        let bytes = serde_json::to_vec(value)?;
        match &self.backend {
            CacheBackend::Memory(mem) => {
                mem.set_raw(key, bytes, ttl);
            }
            CacheBackend::Redis(manager) => {
                let mut guard = manager.lock().await;
                if let Some(t) = ttl {
                    let secs: i64 = t.as_secs().try_into().unwrap_or(i64::MAX);
                    redis::pipe()
                        .set(key, bytes)
                        .expire(key, secs)
                        .query_async::<()>(&mut *guard)
                        .await?;
                } else {
                    redis::cmd("SET")
                        .arg(key)
                        .arg(bytes)
                        .query_async::<()>(&mut *guard)
                        .await?;
                }
            }
        }
        Ok(())
    }

    async fn get<T: DeserializeOwned + Send + Sync>(&self, key: &str) -> Result<Option<T>> {
        trace!(key=%key, backend=%self.backend_kind(), "cache get operation");
        match &self.backend {
            CacheBackend::Memory(mem) => {
                if let Some(raw) = mem.get_raw(key) {
                    let result = serde_json::from_slice(&raw)?;
                    trace!(key=%key, backend=%self.backend_kind(), hit=true, "cache get result");
                    Ok(Some(result))
                } else {
                    trace!(key=%key, backend=%self.backend_kind(), hit=false, "cache get result");
                    Ok(None)
                }
            }
            CacheBackend::Redis(manager) => {
                let mut guard = manager.lock().await;
                let raw: Option<Vec<u8>> =
                    redis::cmd("GET").arg(key).query_async(&mut *guard).await?;
                if let Some(b) = raw {
                    let result = serde_json::from_slice(&b)?;
                    trace!(key=%key, backend=%self.backend_kind(), hit=true, "cache get result");
                    Ok(Some(result))
                } else {
                    trace!(key=%key, backend=%self.backend_kind(), hit=false, "cache get result");
                    Ok(None)
                }
            }
        }
    }

    async fn del(&self, key: &str) -> Result<()> {
        trace!(key=%key, backend=%self.backend_kind(), "cache del operation");
        match &self.backend {
            CacheBackend::Memory(mem) => {
                mem.del(key);
                trace!(key=%key, backend=%self.backend_kind(), "cache del completed");
            }
            CacheBackend::Redis(manager) => {
                let mut guard = manager.lock().await;
                let _: () = redis::cmd("DEL")
                    .arg(key)
                    .query_async::<()>(&mut *guard)
                    .await?;
                trace!(key=%key, backend=%self.backend_kind(), "cache del completed");
            }
        }
        Ok(())
    }

    async fn incr(&self, key: &str, ttl: Option<Duration>) -> Result<i64> {
        trace!(key=%key, ttl=?ttl, backend=%self.backend_kind(), "cache incr operation");
        match &self.backend {
            CacheBackend::Memory(mem) => {
                let current: i64 = if let Some(raw) = mem.get_raw(key) {
                    String::from_utf8_lossy(&raw).parse().unwrap_or(0)
                } else {
                    0
                } + 1;
                mem.set_raw(key, current.to_string().into_bytes(), ttl);
                trace!(key=%key, backend=%self.backend_kind(), new_value=%current, "cache incr completed");
                Ok(current)
            }
            CacheBackend::Redis(manager) => {
                let mut guard = manager.lock().await;
                let val: i64 = redis::cmd("INCR").arg(key).query_async(&mut *guard).await?;
                if let Some(t) = ttl {
                    let secs: i64 = t.as_secs().try_into().unwrap_or(i64::MAX);
                    let _: () = redis::cmd("EXPIRE")
                        .arg(key)
                        .arg(secs)
                        .query_async::<()>(&mut *guard)
                        .await?;
                }
                trace!(key=%key, backend=%self.backend_kind(), new_value=%val, "cache incr completed");
                Ok(val)
            }
        }
    }

    async fn del_prefix(&self, prefix: &str) -> Result<()> {
        trace!(prefix=%prefix, backend=%self.backend_kind(), "cache del_prefix operation");
        match &self.backend {
            CacheBackend::Memory(mem) => {
                let keys: Vec<String> = mem
                    .inner
                    .iter()
                    .filter_map(|kv| {
                        let k = kv.key();
                        if k.starts_with(prefix) {
                            Some(k.clone())
                        } else {
                            None
                        }
                    })
                    .collect();
                let deleted_count = keys.len();
                for k in keys {
                    mem.del(&k);
                }
                trace!(prefix=%prefix, backend=%self.backend_kind(), deleted_count=%deleted_count, "cache del_prefix completed");
                Ok(())
            }
            CacheBackend::Redis(manager) => {
                let mut guard = manager.lock().await;
                let pattern = format!("{}*", prefix);
                let mut cursor: u64 = 0;
                let mut total_deleted = 0;
                loop {
                    let (next, keys): (u64, Vec<String>) = redis::cmd("SCAN")
                        .arg(cursor)
                        .arg("MATCH")
                        .arg(&pattern)
                        .arg("COUNT")
                        .arg(1000)
                        .query_async(&mut *guard)
                        .await?;
                    if !keys.is_empty() {
                        let _: () = redis::cmd("DEL")
                            .arg(&keys)
                            .query_async::<()>(&mut *guard)
                            .await?;
                        total_deleted += keys.len();
                    }
                    if next == 0 {
                        break;
                    }
                    cursor = next;
                }
                trace!(prefix=%prefix, backend=%self.backend_kind(), deleted_count=%total_deleted, "cache del_prefix completed");
                Ok(())
            }
        }
    }
}
