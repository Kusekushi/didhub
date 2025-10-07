use didhub_cache::{AppCache, Cache};
use std::time::Duration;

#[tokio::test]
async fn memory_cache_set_get_expire() {
    let cache = AppCache::memory();
    cache
        .set("k1", &"value", Some(Duration::from_millis(50)))
        .await
        .unwrap();
    let v: Option<String> = cache.get("k1").await.unwrap();
    assert_eq!(v.as_deref(), Some("value"));
    tokio::time::sleep(Duration::from_millis(70)).await;
    let v2: Option<String> = cache.get("k1").await.unwrap();
    assert!(v2.is_none(), "expected entry to expire");
}

#[tokio::test]
async fn memory_cache_incr_monotonic() {
    let cache = AppCache::memory();
    for i in 1..=5 {
        let val = cache
            .incr("ctr", Some(Duration::from_secs(1)))
            .await
            .unwrap();
        assert_eq!(val, i);
    }
}

#[tokio::test]
async fn memory_cache_mixed_operations() {
    let cache = AppCache::memory();

    // Set some data
    cache.set("user:1:name", &"Alice", None).await.unwrap();
    cache.set("user:1:age", &30, None).await.unwrap();

    // Increment a counter
    let views = cache.incr("user:1:views", None).await.unwrap();
    assert_eq!(views, 1);

    // Check data
    let name: Option<String> = cache.get("user:1:name").await.unwrap();
    let age: Option<i32> = cache.get("user:1:age").await.unwrap();
    let views_after: Option<i64> = cache.get("user:1:views").await.unwrap();

    assert_eq!(name, Some("Alice".to_string()));
    assert_eq!(age, Some(30));
    assert_eq!(views_after, Some(1));
}

#[tokio::test]
async fn memory_cache_prefix_operations() {
    let cache = AppCache::memory();

    // Set up a user profile with multiple keys
    cache.set("user:123:name", &"Bob", None).await.unwrap();
    cache
        .set("user:123:email", &"bob@example.com", None)
        .await
        .unwrap();
    cache.set("user:123:score", &100, None).await.unwrap();
    cache.set("user:456:name", &"Charlie", None).await.unwrap();

    // Delete all user:123 keys
    cache.del_prefix("user:123:").await.unwrap();

    // Check deletions
    let bob_name: Option<String> = cache.get("user:123:name").await.unwrap();
    let bob_email: Option<String> = cache.get("user:123:email").await.unwrap();
    let bob_score: Option<i32> = cache.get("user:123:score").await.unwrap();
    let charlie_name: Option<String> = cache.get("user:456:name").await.unwrap();

    assert!(bob_name.is_none());
    assert!(bob_email.is_none());
    assert!(bob_score.is_none());
    assert_eq!(charlie_name, Some("Charlie".to_string()));
}

#[tokio::test]
async fn memory_cache_ttl_precision() {
    let cache = AppCache::memory();

    // Test very short TTL
    cache
        .set("short", &"value", Some(Duration::from_millis(1)))
        .await
        .unwrap();
    tokio::time::sleep(Duration::from_millis(2)).await;
    let expired: Option<String> = cache.get("short").await.unwrap();
    assert!(expired.is_none());

    // Test longer TTL
    cache
        .set("long", &"value", Some(Duration::from_secs(1)))
        .await
        .unwrap();
    tokio::time::sleep(Duration::from_millis(500)).await;
    let still_there: Option<String> = cache.get("long").await.unwrap();
    assert_eq!(still_there, Some("value".to_string()));
    tokio::time::sleep(Duration::from_millis(600)).await;
    let now_expired: Option<String> = cache.get("long").await.unwrap();
    assert!(now_expired.is_none());
}

#[tokio::test]
async fn memory_cache_concurrent_access() {
    let cache = AppCache::memory();

    // Spawn multiple tasks to test concurrent access
    let mut handles = vec![];

    for i in 0..10 {
        let cache_clone = cache.clone();
        let handle = tokio::spawn(async move {
            let key = format!("concurrent_{}", i);
            cache_clone.set(&key, &i, None).await.unwrap();
            let val: Option<i32> = cache_clone.get(&key).await.unwrap();
            assert_eq!(val, Some(i));
        });
        handles.push(handle);
    }

    for handle in handles {
        handle.await.unwrap();
    }

    // Verify all values are set
    for i in 0..10 {
        let key = format!("concurrent_{}", i);
        let val: Option<i32> = cache.get(&key).await.unwrap();
        assert_eq!(val, Some(i));
    }
}

#[tokio::test]
async fn memory_cache_backend_kind() {
    let cache = AppCache::memory();
    assert_eq!(cache.backend_kind(), "memory");
}

#[tokio::test]
async fn memory_cache_integration_scenario() {
    // Simulate a realistic usage scenario
    let cache = AppCache::memory();

    // User session management
    cache
        .set(
            "session:user123:token",
            &"abc123",
            Some(Duration::from_secs(3600)),
        )
        .await
        .unwrap();
    cache
        .set(
            "session:user123:data",
            &serde_json::json!({"name": "John", "role": "admin"}),
            None,
        )
        .await
        .unwrap();

    // API rate limiting
    let requests1 = cache
        .incr("rate_limit:user123:minute", Some(Duration::from_secs(60)))
        .await
        .unwrap();
    assert_eq!(requests1, 1);

    // Cache some computed results
    cache.set("computed:fib:10", &55, None).await.unwrap();
    cache
        .set(
            "computed:prime:100",
            &vec![
                2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79,
                83, 89, 97,
            ],
            None,
        )
        .await
        .unwrap();

    // Verify everything is accessible
    let token: Option<String> = cache.get("session:user123:token").await.unwrap();
    let data: Option<serde_json::Value> = cache.get("session:user123:data").await.unwrap();
    let fib: Option<i32> = cache.get("computed:fib:10").await.unwrap();
    let primes: Option<Vec<i32>> = cache.get("computed:prime:100").await.unwrap();

    assert_eq!(token, Some("abc123".to_string()));
    assert_eq!(data.as_ref().unwrap()["name"], "John");
    assert_eq!(fib, Some(55));
    assert_eq!(primes.as_ref().unwrap().len(), 25);

    // Clean up user session
    cache.del_prefix("session:user123:").await.unwrap();

    let token_after: Option<String> = cache.get("session:user123:token").await.unwrap();
    assert!(token_after.is_none());

    // Computed results should still be there
    let fib_after: Option<i32> = cache.get("computed:fib:10").await.unwrap();
    assert_eq!(fib_after, Some(55));
}
