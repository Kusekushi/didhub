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
