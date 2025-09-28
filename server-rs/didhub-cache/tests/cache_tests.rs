use didhub_cache::{AppCache, Cache};
use serde::{Serialize, Deserialize};

#[derive(Serialize, Deserialize, PartialEq, Debug)]
struct Sample { a: i32, b: String }

#[tokio::test]
async fn memory_cache_basic() {
    let cache = AppCache::memory();
    let v = Sample { a: 42, b: "hello".into() };
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
