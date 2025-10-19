use dashmap::DashMap;
use std::sync::Arc;
use std::time::Instant;
use tokio::sync::Mutex;

/// A simple token-bucket instance.
#[derive(Clone)]
pub struct TokenBucket {
    inner: Arc<Mutex<TokenBucketInner>>,
}

struct TokenBucketInner {
    capacity: f64,
    tokens: f64,
    refill_per_sec: f64,
    last_check: Instant,
}

impl TokenBucket {
    pub fn new(capacity: usize, refill_per_sec: f64) -> Self {
        let inner = TokenBucketInner {
            capacity: capacity as f64,
            tokens: capacity as f64,
            refill_per_sec,
            last_check: Instant::now(),
        };
        Self {
            inner: Arc::new(Mutex::new(inner)),
        }
    }

    pub async fn try_acquire(&self) -> bool {
        let mut inner = self.inner.lock().await;
        let now = Instant::now();
        let elapsed = now.duration_since(inner.last_check).as_secs_f64();
        if elapsed > 0.0 {
            inner.tokens = (inner.tokens + elapsed * inner.refill_per_sec).min(inner.capacity);
            inner.last_check = now;
        }
        if inner.tokens >= 1.0 {
            inner.tokens -= 1.0;
            true
        } else {
            false
        }
    }
}

/// Manager that holds per-key token buckets and configuration like exempt paths.
#[derive(Clone)]
pub struct RateLimiterManager {
    buckets: Arc<DashMap<String, TokenBucket>>,
    pub enabled: bool,
    pub per_ip: bool,
    pub per_user: bool,
    pub rate_per_sec: f64,
    pub burst: usize,
    pub exempt_paths: Arc<Vec<String>>,
}

impl RateLimiterManager {
    pub fn from_config(
        enabled: bool,
        per_ip: bool,
        per_user: bool,
        rate_per_sec: f64,
        burst: usize,
        exempt_paths: Vec<String>,
    ) -> Self {
        Self {
            buckets: Arc::new(DashMap::new()),
            enabled,
            per_ip,
            per_user,
            rate_per_sec,
            burst,
            exempt_paths: Arc::new(exempt_paths),
        }
    }

    /// Determine whether a given path is exempt.
    pub fn is_exempt(&self, path: &str) -> bool {
        for p in self.exempt_paths.iter() {
            if p == path {
                return true;
            }
        }
        false
    }

    /// Acquire a token for a key (e.g., IP or user id). If limiter is disabled, always allow.
    pub async fn try_acquire_for(&self, key: &str) -> bool {
        if !self.enabled {
            return true;
        }
        let bucket = self
            .buckets
            .entry(key.to_string())
            .or_insert_with(|| TokenBucket::new(self.burst, self.rate_per_sec));
        bucket.try_acquire().await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    #[tokio::test]
    async fn token_bucket_refill_and_capacity() {
        let tb = TokenBucket::new(2, 1.0); // capacity 2, 1 token/sec
                                           // consume two tokens
        assert!(tb.try_acquire().await);
        assert!(tb.try_acquire().await);
        // now empty
        assert!(!tb.try_acquire().await);
        // wait >1s to refill one token
        tokio::time::sleep(Duration::from_millis(1200)).await;
        assert!(tb.try_acquire().await);
    }

    #[tokio::test]
    async fn rate_limiter_manager_per_key() {
        let manager = RateLimiterManager::from_config(true, true, true, 10.0, 1, vec![]);
        // per-key buckets: key 'a' and 'b' each have their own bucket
        assert!(manager.try_acquire_for("a").await);
        assert!(!manager.try_acquire_for("a").await);
        assert!(manager.try_acquire_for("b").await);
    }
}
