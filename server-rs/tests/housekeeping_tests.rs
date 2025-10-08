use didhub_server::{build_router, config::AppConfig, db::Db};
use axum::{Router, body::Body, http::{Request, StatusCode}};
use http_body_util::BodyExt;
use tower::ServiceExt; // oneshot
use serde_json::json;
use chrono::{Utc, Duration};

async fn test_ctx() -> (Router, Db, String) {
    let db_file = format!("test-db-{}.sqlite", uuid::Uuid::new_v4());
    let db = Db::connect_with_file(&db_file).await.expect("connect sqlite");
    let mut cfg = AppConfig::default_for_tests();
    cfg.bootstrap_admin_username = Some("admin".into());
    cfg.bootstrap_admin_password = Some("adminpw".into());
    db.ensure_bootstrap_admin(&cfg).await.unwrap();
    let router = build_router(db.clone(), cfg).await;
    // admin login
    let login = Request::builder().method("POST").uri("/api/auth/login").header("content-type","application/json").body(Body::from(json!({"username":"admin","password":"adminpw"}).to_string())).unwrap();
    let resp = router.clone().oneshot(login).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
    let body_bytes = resp.into_body().collect().await.unwrap().to_bytes();
    let v: serde_json::Value = serde_json::from_slice(&body_bytes).unwrap();
    let token = v.get("token").and_then(|t| t.as_str()).unwrap().to_string();
    (router, db, token)
}

#[tokio::test]
async fn housekeeping_audit_retention_flow() {
    let (app, db, admin_token) = test_ctx().await;

    // Insert a few audit rows manually with old timestamps (simulate past events)
    // We assume audit_log schema: id INTEGER PK, ts TEXT, actor_id INTEGER NULL, action TEXT, entity TEXT, metadata TEXT NULL
    // Use direct SQL to avoid needing to call routes with clock manipulation.
    let cutoff_days = 5; // retention will be 5 days
    let old_ts = (Utc::now() - Duration::days(cutoff_days as i64 + 10)).to_rfc3339();
    for i in 0..3 { sqlx::query("INSERT INTO audit_log (created_at, user_id, action, entity_type, entity_id, ip, metadata) VALUES (?1,NULL,?2,'system',NULL,NULL,NULL)")
        .bind(&old_ts).bind(format!("old_event_{}", i)).execute(&db.pool).await.unwrap(); }

    // Add a recent audit entry that should survive
    let recent_ts = Utc::now().to_rfc3339();
    sqlx::query("INSERT INTO audit_log (created_at, user_id, action, entity_type, entity_id, ip, metadata) VALUES (?1,NULL,'recent_event','system',NULL,NULL,NULL)")
        .bind(&recent_ts).execute(&db.pool).await.unwrap();

    // Configure retention days setting
    let set_retention = Request::builder().method("PUT").uri("/api/settings/audit.retention.days")
        .header("authorization", format!("Bearer {}", admin_token))
        .header("content-type","application/json")
        .body(Body::from(json!({"value": cutoff_days}).to_string())).unwrap();
    let resp = app.clone().oneshot(set_retention).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);

    // Trigger housekeeping job
    let trigger = Request::builder().method("POST").uri("/api/housekeeping/trigger/audit_retention")
        .header("authorization", format!("Bearer {}", admin_token))
        .body(Body::empty()).unwrap();
    let resp = app.clone().oneshot(trigger).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
    let body_bytes = resp.into_body().collect().await.unwrap().to_bytes();
    let run_out: serde_json::Value = serde_json::from_slice(&body_bytes).unwrap();
    assert_eq!(run_out.get("job").unwrap(), "audit_retention");
    assert_eq!(run_out.get("status").and_then(|s| s.as_str()).unwrap(), "queued");
    assert!(run_out.get("run_id").and_then(|id| id.as_i64()).is_some());

    // List runs
    let runs = Request::builder().method("GET").uri("/api/housekeeping/runs")
        .header("authorization", format!("Bearer {}", admin_token))
        .body(Body::empty()).unwrap();
    let resp = app.clone().oneshot(runs).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
    let body_bytes = resp.into_body().collect().await.unwrap().to_bytes();
    let runs_json: serde_json::Value = serde_json::from_slice(&body_bytes).unwrap();
    let runs_arr = runs_json.get("runs").and_then(|r| r.as_array()).expect("runs array");
    // If empty, fallback to direct DB check; the scheduler may not have polled yet but manual trigger should record run.
    if runs_arr.is_empty() {
        let count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM housekeeping_runs WHERE job_name='audit_retention'")
            .fetch_one(&db.pool).await.unwrap();
        assert!(count.0 >= 1, "expected at least one housekeeping_runs row, runs endpoint returned: {}", runs_json);
    }

    // Ensure old events purged and recent remains
    let remaining: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM audit_log WHERE action LIKE 'old_event_%'")
        .fetch_one(&db.pool).await.unwrap();
    assert_eq!(remaining.0, 0, "old audit rows should be purged");
    let recent_remaining: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM audit_log WHERE action='recent_event'")
        .fetch_one(&db.pool).await.unwrap();
    assert_eq!(recent_remaining.0, 1, "recent audit row should remain");

    // List jobs
    let jobs = Request::builder().method("GET").uri("/api/housekeeping/jobs")
        .header("authorization", format!("Bearer {}", admin_token))
        .body(Body::empty()).unwrap();
    let resp = app.clone().oneshot(jobs).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
    let body_bytes = resp.into_body().collect().await.unwrap().to_bytes();
    let jobs_json: serde_json::Value = serde_json::from_slice(&body_bytes).unwrap();
    let jobs_arr = jobs_json.get("jobs").and_then(|j| j.as_array()).expect("jobs array");
    assert!(jobs_arr.iter().any(|j| j=="audit_retention"));
}
