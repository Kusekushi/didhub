use crate::interface::Cache;
use anyhow::Result;
use dashmap::DashMap;
use didhub_metrics::record_cache_operation;
use serde::{de::DeserializeOwned, Serialize};
use std::time::{Duration, Instant};
use tracing::trace;

#[derive(Clone)]
pub struct MemoryEntry {
    pub value: Vec<u8>,
    pub expires_at: Option<Instant>,
}

#[derive(Clone, Default)]
pub struct MemoryCache {
    pub(crate) inner: std::sync::Arc<DashMap<String, MemoryEntry>>,
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
    pub async fn remove(&self, key: &str) {
        self.inner.remove(key);
    }
}

#[async_trait::async_trait]
impl Cache for MemoryCache {
    async fn set<T: Serialize + Send + Sync>(
        &self,
        key: &str,
        value: &T,
        ttl: Option<Duration>,
    ) -> Result<()> {
        trace!(key=%key, ttl=?ttl, backend="memory", "cache set operation");
        let bytes = serde_json::to_vec(value)?;
        self.set_raw(key, bytes, ttl);
        record_cache_operation("set", "success");
        Ok(())
    }

    async fn get<T: DeserializeOwned + Send + Sync>(&self, key: &str) -> Result<Option<T>> {
        trace!(key=%key, backend="memory", "cache get operation");
        if let Some(raw) = self.get_raw(key) {
            let result = serde_json::from_slice(&raw)?;
            trace!(key=%key, backend="memory", hit=true, "cache get result");
            record_cache_operation("get", "hit");
            Ok(Some(result))
        } else {
            trace!(key=%key, backend="memory", hit=false, "cache get result");
            record_cache_operation("get", "miss");
            Ok(None)
        }
    }

    async fn del(&self, key: &str) -> Result<()> {
        trace!(key=%key, backend="memory", "cache del operation");
        self.remove(key).await;
        trace!(key=%key, backend="memory", "cache del completed");
        record_cache_operation("del", "success");
        Ok(())
    }

    async fn incr(&self, key: &str, ttl: Option<Duration>) -> Result<i64> {
        trace!(key=%key, ttl=?ttl, backend="memory", "cache incr operation");
        let current: i64 = if let Some(raw) = self.get_raw(key) {
            String::from_utf8_lossy(&raw).parse().unwrap_or(0)
        } else {
            0
        } + 1;
        self.set_raw(key, current.to_string().into_bytes(), ttl);
        trace!(key=%key, backend="memory", new_value=%current, "cache incr completed");
        record_cache_operation("incr", "success");
        Ok(current)
    }

    async fn del_prefix(&self, prefix: &str) -> Result<()> {
        trace!(prefix=%prefix, backend="memory", "cache del_prefix operation");
        if prefix.is_empty() {
            trace!(prefix=%prefix, backend="memory", "cache del_prefix skipped for empty prefix");
            return Ok(());
        }
        let keys: Vec<String> = self
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
            self.remove(&k).await;
        }
        trace!(prefix=%prefix, backend="memory", deleted_count=%deleted_count, "cache del_prefix completed");
        record_cache_operation("del_prefix", "success");
        Ok(())
    }

    async fn ping(&self) -> Result<bool> {
        trace!(backend = "memory", "cache ping operation");
        // Memory cache is always available
        trace!(
            backend = "memory",
            ping_success = true,
            "cache ping completed"
        );
        Ok(true)
    }

    async fn get_info(&self) -> Result<Option<std::collections::HashMap<String, String>>> {
        trace!(backend = "memory", "cache get_info operation");
        // Memory cache doesn't have meaningful info to provide
        trace!(backend = "memory", "cache get_info completed");
        Ok(None)
    }
}
