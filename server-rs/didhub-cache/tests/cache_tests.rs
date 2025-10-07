use didhub_cache::{AppCache, Cache};
use serde::{Deserialize, Serialize};
use std::time::Duration;

#[derive(Serialize, Deserialize, PartialEq, Debug, Clone)]
struct Sample {
    a: i32,
    b: String,
}

#[derive(Serialize, Deserialize, PartialEq, Debug, Clone)]
struct ComplexSample {
    id: u64,
    data: Vec<String>,
    nested: Option<Box<Sample>>,
}

#[tokio::test]
async fn memory_cache_basic() {
    let cache = AppCache::memory();
    let v = Sample {
        a: 42,
        b: "hello".into(),
    };
    cache.set("k1", &v, None).await.unwrap();
    let got: Option<Sample> = cache.get("k1").await.unwrap();
    assert_eq!(got, Some(v));
    let n1 = cache.incr("counter", None).await.unwrap();
    assert_eq!(n1, 1);
    let n2 = cache.incr("counter", None).await.unwrap();
    assert_eq!(n2, 2);
    cache.del("k1").await.unwrap();
    let gone: Option<Sample> = cache.get("k1").await.unwrap();
    assert!(gone.is_none());
}

#[tokio::test]
async fn memory_cache_ttl() {
    let cache = AppCache::memory();
    let v = Sample {
        a: 1,
        b: "test".into(),
    };

    // Set with TTL
    cache
        .set("ttl_key", &v, Some(Duration::from_millis(50)))
        .await
        .unwrap();
    let got: Option<Sample> = cache.get("ttl_key").await.unwrap();
    assert_eq!(got, Some(v));

    // Wait for expiration
    tokio::time::sleep(Duration::from_millis(60)).await;
    let expired: Option<Sample> = cache.get("ttl_key").await.unwrap();
    assert!(expired.is_none());
}

#[tokio::test]
async fn memory_cache_no_ttl() {
    let cache = AppCache::memory();
    let v = Sample {
        a: 100,
        b: "persistent".into(),
    };

    cache.set("persistent", &v, None).await.unwrap();
    tokio::time::sleep(Duration::from_millis(100)).await;
    let still_there: Option<Sample> = cache.get("persistent").await.unwrap();
    assert_eq!(still_there, Some(v));
}

#[tokio::test]
async fn memory_cache_incr_with_ttl() {
    let cache = AppCache::memory();

    let val1 = cache
        .incr("incr_ttl", Some(Duration::from_millis(50)))
        .await
        .unwrap();
    assert_eq!(val1, 1);

    let val2 = cache
        .incr("incr_ttl", Some(Duration::from_millis(50)))
        .await
        .unwrap();
    assert_eq!(val2, 2);

    // Wait for expiration
    tokio::time::sleep(Duration::from_millis(60)).await;
    let val3 = cache.incr("incr_ttl", None).await.unwrap();
    assert_eq!(val3, 1); // Should start over
}

#[tokio::test]
async fn memory_cache_del_prefix() {
    let cache = AppCache::memory();

    cache.set("prefix_a", &"value_a", None).await.unwrap();
    cache.set("prefix_b", &"value_b", None).await.unwrap();
    cache.set("other_c", &"value_c", None).await.unwrap();

    cache.del_prefix("prefix_").await.unwrap();

    let a: Option<String> = cache.get("prefix_a").await.unwrap();
    let b: Option<String> = cache.get("prefix_b").await.unwrap();
    let c: Option<String> = cache.get("other_c").await.unwrap();

    assert!(a.is_none());
    assert!(b.is_none());
    assert_eq!(c, Some("value_c".to_string()));
}

#[tokio::test]
async fn memory_cache_complex_types() {
    let cache = AppCache::memory();
    let complex = ComplexSample {
        id: 12345,
        data: vec!["item1".to_string(), "item2".to_string()],
        nested: Some(Box::new(Sample {
            a: 99,
            b: "nested".to_string(),
        })),
    };

    cache.set("complex", &complex, None).await.unwrap();
    let retrieved: Option<ComplexSample> = cache.get("complex").await.unwrap();
    assert_eq!(retrieved, Some(complex));
}

#[tokio::test]
async fn memory_cache_overwrite() {
    let cache = AppCache::memory();

    let v1 = Sample {
        a: 1,
        b: "first".into(),
    };
    let v2 = Sample {
        a: 2,
        b: "second".into(),
    };

    cache.set("key", &v1, None).await.unwrap();
    let got1: Option<Sample> = cache.get("key").await.unwrap();
    assert_eq!(got1, Some(v1));

    cache.set("key", &v2, None).await.unwrap();
    let got2: Option<Sample> = cache.get("key").await.unwrap();
    assert_eq!(got2, Some(v2));
}

#[tokio::test]
async fn memory_cache_empty_key() {
    let cache = AppCache::memory();
    let v = Sample { a: 0, b: "".into() };

    cache.set("", &v, None).await.unwrap();
    let got: Option<Sample> = cache.get("").await.unwrap();
    assert_eq!(got, Some(v));

    cache.del("").await.unwrap();
    let gone: Option<Sample> = cache.get("").await.unwrap();
    assert!(gone.is_none());
}

#[tokio::test]
async fn memory_cache_large_data() {
    let cache = AppCache::memory();
    let large_data = ComplexSample {
        id: 999999,
        data: (0..1000).map(|i| format!("item_{}", i)).collect(),
        nested: None,
    };

    cache.set("large", &large_data, None).await.unwrap();
    let retrieved: Option<ComplexSample> = cache.get("large").await.unwrap();
    assert_eq!(retrieved, Some(large_data));
}

#[tokio::test]
async fn memory_cache_incr_edge_cases() {
    let cache = AppCache::memory();

    // Incr on non-existent key
    let val = cache.incr("new_counter", None).await.unwrap();
    assert_eq!(val, 1);

    // Incr on existing string value (should fail gracefully or handle)
    cache
        .set("string_key", &"not_a_number", None)
        .await
        .unwrap();
    // Note: Current impl parses as i64, defaults to 0 on error
    let incr_result = cache.incr("string_key", None).await.unwrap();
    assert_eq!(incr_result, 1); // Since parsing "not_a_number" fails, starts from 0 + 1
}

#[tokio::test]
async fn memory_cache_get_nonexistent() {
    let cache = AppCache::memory();

    let nonexistent: Option<Sample> = cache.get("does_not_exist").await.unwrap();
    assert!(nonexistent.is_none());
}

#[tokio::test]
async fn memory_cache_del_nonexistent() {
    let cache = AppCache::memory();

    // Should not error
    cache.del("nonexistent").await.unwrap();
}

#[tokio::test]
async fn memory_cache_del_prefix_empty() {
    let cache = AppCache::memory();

    cache.set("test", &"value", None).await.unwrap();
    cache.del_prefix("").await.unwrap(); // Empty prefix should not delete everything

    let still_there: Option<String> = cache.get("test").await.unwrap();
    assert_eq!(still_there, Some("value".to_string()));
}

#[tokio::test]
async fn memory_cache_cleanup() {
    let cache = AppCache::memory();

    // Set multiple entries with short TTL
    for i in 0..10 {
        cache
            .set(&format!("temp_{}", i), &i, Some(Duration::from_millis(10)))
            .await
            .unwrap();
    }

    // All should be present initially
    for i in 0..10 {
        let val: Option<i32> = cache.get(&format!("temp_{}", i)).await.unwrap();
        assert_eq!(val, Some(i));
    }

    // Wait for expiration
    tokio::time::sleep(Duration::from_millis(20)).await;

    // Trigger cleanup by accessing (lazy cleanup)
    let _: Option<i32> = cache.get("temp_0").await.unwrap();

    // Should be cleaned up
    for i in 0..10 {
        let val: Option<i32> = cache.get(&format!("temp_{}", i)).await.unwrap();
        assert!(val.is_none());
    }
}
