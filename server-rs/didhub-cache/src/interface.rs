use anyhow::Result;
use serde::{de::DeserializeOwned, Serialize};
use std::{collections::HashMap, time::Duration};

#[async_trait::async_trait]
pub trait Cache: Send + Sync + 'static {
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

    /// Ping the cache backend to check connectivity
    async fn ping(&self) -> Result<bool> {
        Ok(true) // Default implementation for backends that don't need ping
    }

    /// Get server information from the cache backend
    async fn get_info(&self) -> Result<Option<HashMap<String, String>>> {
        Ok(None) // Default implementation for backends that don't provide info
    }
}
