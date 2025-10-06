use anyhow::Result;
use serde::{de::DeserializeOwned, Serialize};
use std::time::Duration;

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
}