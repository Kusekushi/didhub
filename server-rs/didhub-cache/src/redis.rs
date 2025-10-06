use crate::interface::Cache;
use anyhow::Result;
use redis::aio::MultiplexedConnection;
use serde::{de::DeserializeOwned, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::Mutex;
use tracing::trace;

pub type RedisManager = Arc<Mutex<MultiplexedConnection>>;

#[derive(Clone)]
pub struct RedisCache {
    manager: RedisManager,
}

impl RedisCache {
    pub fn new(manager: RedisManager) -> Self {
        Self { manager }
    }

    pub fn manager(&self) -> &RedisManager {
        &self.manager
    }
}

#[async_trait::async_trait]
impl Cache for RedisCache {
    async fn set<T: Serialize + Send + Sync>(
        &self,
        key: &str,
        value: &T,
        ttl: Option<Duration>,
    ) -> Result<()> {
        trace!(key=%key, ttl=?ttl, backend="redis", "cache set operation");
        let bytes = serde_json::to_vec(value)?;
        let mut guard = self.manager.lock().await;
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
        Ok(())
    }

    async fn get<T: DeserializeOwned + Send + Sync>(&self, key: &str) -> Result<Option<T>> {
        trace!(key=%key, backend="redis", "cache get operation");
        let mut guard = self.manager.lock().await;
        let raw: Option<Vec<u8>> =
            redis::cmd("GET").arg(key).query_async(&mut *guard).await?;
        if let Some(b) = raw {
            let result = serde_json::from_slice(&b)?;
            trace!(key=%key, backend="redis", hit=true, "cache get result");
            Ok(Some(result))
        } else {
            trace!(key=%key, backend="redis", hit=false, "cache get result");
            Ok(None)
        }
    }

    async fn del(&self, key: &str) -> Result<()> {
        trace!(key=%key, backend="redis", "cache del operation");
        let mut guard = self.manager.lock().await;
        let _: () = redis::cmd("DEL")
            .arg(key)
            .query_async::<()>(&mut *guard)
            .await?;
        trace!(key=%key, backend="redis", "cache del completed");
        Ok(())
    }

    async fn incr(&self, key: &str, ttl: Option<Duration>) -> Result<i64> {
        trace!(key=%key, ttl=?ttl, backend="redis", "cache incr operation");
        let mut guard = self.manager.lock().await;
        let val: i64 = redis::cmd("INCR").arg(key).query_async(&mut *guard).await?;
        if let Some(t) = ttl {
            let secs: i64 = t.as_secs().try_into().unwrap_or(i64::MAX);
            let _: () = redis::cmd("EXPIRE")
                .arg(key)
                .arg(secs)
                .query_async::<()>(&mut *guard)
                .await?;
        }
        trace!(key=%key, backend="redis", new_value=%val, "cache incr completed");
        Ok(val)
    }

    async fn del_prefix(&self, prefix: &str) -> Result<()> {
        trace!(prefix=%prefix, backend="redis", "cache del_prefix operation");
        if prefix.is_empty() {
            trace!(prefix=%prefix, backend="redis", "cache del_prefix skipped for empty prefix");
            return Ok(());
        }
        let mut guard = self.manager.lock().await;
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
        trace!(prefix=%prefix, backend="redis", deleted_count=%total_deleted, "cache del_prefix completed");
        Ok(())
    }

    async fn ping(&self) -> Result<bool> {
        trace!(backend="redis", "cache ping operation");
        let mut guard = self.manager.lock().await;
        let pong: Result<String, _> = redis::cmd("PING").query_async(&mut *guard).await;
        let is_ok = pong.map_or(false, |p| p.to_uppercase() == "PONG");
        trace!(backend="redis", ping_success=%is_ok, "cache ping completed");
        Ok(is_ok)
    }

    async fn get_info(&self) -> Result<Option<HashMap<String, String>>> {
        trace!(backend="redis", "cache get_info operation");
        let mut guard = self.manager.lock().await;
        let raw: Result<String, _> = redis::cmd("INFO")
            .arg("server")
            .arg("clients")
            .arg("memory")
            .arg("stats")
            .arg("keyspace")
            .query_async(&mut *guard)
            .await;

        if let Ok(txt) = raw {
            let mut map = HashMap::new();
            for line in txt.lines() {
                if line.starts_with('#') || line.trim().is_empty() {
                    continue;
                }
                if let Some((k, v)) = line.split_once(':') {
                    map.insert(k.trim().to_string(), v.trim().to_string());
                }
            }
            trace!(backend="redis", info_entries=%map.len(), "cache get_info completed");
            Ok(Some(map))
        } else {
            trace!(backend="redis", "cache get_info failed");
            Ok(None)
        }
    }
}