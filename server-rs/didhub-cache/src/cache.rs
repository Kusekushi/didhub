use anyhow::Result;
use serde::{de::DeserializeOwned, Serialize};
use std::time::Duration;
use crate::interface::Cache;
use crate::memory::MemoryCache;
use crate::redis::{RedisCache, RedisManager};

#[derive(Clone)]
pub enum CacheBackend {
    Memory(MemoryCache),
    Redis(RedisCache),
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
            backend: CacheBackend::Redis(RedisCache::new(manager)),
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
}

#[async_trait::async_trait]
impl Cache for AppCache {
    async fn set<T: Serialize + Send + Sync>(
        &self,
        key: &str,
        value: &T,
        ttl: Option<Duration>,
    ) -> Result<()> {
        match &self.backend {
            CacheBackend::Memory(m) => m.set(key, value, ttl).await,
            CacheBackend::Redis(r) => r.set(key, value, ttl).await,
        }
    }

    async fn get<T: DeserializeOwned + Send + Sync>(&self, key: &str) -> Result<Option<T>> {
        match &self.backend {
            CacheBackend::Memory(m) => m.get(key).await,
            CacheBackend::Redis(r) => r.get(key).await,
        }
    }

    async fn del(&self, key: &str) -> Result<()> {
        match &self.backend {
            CacheBackend::Memory(m) => m.del(key).await,
            CacheBackend::Redis(r) => r.del(key).await,
        }
    }

    async fn incr(&self, key: &str, ttl: Option<Duration>) -> Result<i64> {
        match &self.backend {
            CacheBackend::Memory(m) => m.incr(key, ttl).await,
            CacheBackend::Redis(r) => r.incr(key, ttl).await,
        }
    }

    async fn del_prefix(&self, prefix: &str) -> Result<()> {
        match &self.backend {
            CacheBackend::Memory(m) => m.del_prefix(prefix).await,
            CacheBackend::Redis(r) => r.del_prefix(prefix).await,
        }
    }
}
