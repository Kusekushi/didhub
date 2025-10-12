use async_trait::async_trait;
use didhub_server::routes::admin::audit::{purge_audit_inner, PurgeBody};
use didhub_middleware::types::CurrentUser;
use didhub_db::common::CommonOperations;
use didhub_db::models::AuditLog;
use anyhow::Result as AnyResult;
use std::future::Future;
use std::sync::Mutex;

struct MockDb {
    pub clear_called: Mutex<bool>,
    pub clear_return: i64,
}

impl MockDb {
    fn new(ret: i64) -> Self {
        Self { clear_called: Mutex::new(false), clear_return: ret }
    }
}

#[async_trait]
impl CommonOperations for MockDb {
    async fn insert_and_return<T, F1, F2, Fut1, Fut2>(
        &self,
        _sqlite_postgres_fn: F1,
        _mysql_fn: F2,
    ) -> AnyResult<T>
    where
        F1: FnOnce() -> Fut1 + Send,
        F2: FnOnce() -> Fut2 + Send,
        Fut1: Future<Output = AnyResult<T>> + Send,
        Fut2: Future<Output = AnyResult<T>> + Send,
        T: Send,
    {
        Err(anyhow::anyhow!("not implemented"))
    }

    async fn insert_audit(
        &self,
        _user_id: Option<&str>,
        _action: &str,
        _entity_type: Option<&str>,
        _entity_id: Option<&str>,
        _ip: Option<&str>,
        _metadata_json: Option<&serde_json::Value>,
    ) -> AnyResult<()> {
        Ok(())
    }

    async fn list_audit(
        &self,
        _action: Option<&str>,
        _user_id: Option<&str>,
        _from: Option<&str>,
        _to: Option<&str>,
        _limit: i64,
        _offset: i64,
    ) -> AnyResult<Vec<AuditLog>> {
        Ok(Vec::new())
    }

    async fn purge_audit_before(&self, _before: &str) -> AnyResult<i64> {
        Ok(0)
    }

    async fn clear_audit(&self) -> AnyResult<i64> {
        let mut g = self.clear_called.lock().unwrap();
        *g = true;
        Ok(self.clear_return)
    }

    async fn start_housekeeping_run(&self, _job_name: &str) -> AnyResult<didhub_db::models::HousekeepingRun> {
        Err(anyhow::anyhow!("not implemented"))
    }

    async fn finish_housekeeping_run(
        &self,
        _id: &str,
        _success: bool,
        _message: Option<&str>,
        _rows: Option<i64>,
    ) -> AnyResult<()> {
        Err(anyhow::anyhow!("not implemented"))
    }

    async fn list_housekeeping_runs(&self, _job_name: Option<&str>, _limit: i64, _offset: i64) -> AnyResult<Vec<didhub_db::models::HousekeepingRun>> {
        Ok(Vec::new())
    }

    async fn clear_housekeeping_runs(&self, _job_name: Option<&str>) -> AnyResult<i64> {
        Ok(0)
    }
}

#[tokio::test]
async fn purge_without_before_calls_clear() {
    let mock = MockDb::new(123);
    let user = CurrentUser {
        id: "u1".into(),
        username: "u1".into(),
        avatar: None,
        is_admin: 1,
        is_system: 0,
        is_approved: 0,
        must_change_password: 0,
    };
    let body = PurgeBody { before: None };
    let v = purge_audit_inner(&mock, &user, &body).await.expect("should succeed");
    let deleted = v.get("deleted").and_then(|n| n.as_i64()).unwrap();
    assert_eq!(deleted, 123);
    assert!(*mock.clear_called.lock().unwrap(), "clear_audit was not called");
}
