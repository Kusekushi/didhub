use axum::{
    extract::{Path, Query},
    Extension, Json,
};
use didhub_db::{common::CommonOperations, Db};
use didhub_error::AppError;
use didhub_scheduler::CronScheduler;
use serde::{Deserialize, Serialize};
use tracing::error;

#[derive(Clone)]
pub struct HousekeepingState {
    pub db: Db,
    pub registry: CronScheduler,
}

#[derive(Serialize)]
pub struct JobInfo {
    pub name: String,
    pub description: String,
    pub enabled: bool,
    pub last_run: Option<String>,
}

#[derive(Serialize)]
pub struct JobsList {
    pub jobs: Vec<JobInfo>,
}

pub async fn list_jobs(Extension(state): Extension<HousekeepingState>) -> Json<JobsList> {
    let jobs_metadata = state.registry.list_jobs_with_metadata().await;
    let jobs = jobs_metadata
        .into_iter()
        .map(|(name, description, enabled, last_run)| JobInfo {
            name,
            description,
            enabled,
            last_run,
        })
        .collect();
    Json(JobsList { jobs })
}

#[derive(Deserialize)]
pub struct RunsQuery {
    pub job: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[derive(Serialize)]
pub struct RunRecord {
    pub id: i64,
    pub job_name: String,
    pub started_at: String,
    pub finished_at: Option<String>,
    pub status: String,
    pub message: Option<String>,
    pub rows_affected: Option<i64>,
}

#[derive(Serialize)]
pub struct RunsList {
    pub runs: Vec<RunRecord>,
}

pub async fn list_runs(
    Extension(state): Extension<HousekeepingState>,
    Query(q): Query<RunsQuery>,
) -> Result<Json<RunsList>, AppError> {
    let runs = state
        .db
        .list_housekeeping_runs(
            q.job.as_deref(),
            q.limit.unwrap_or(50).min(500),
            q.offset.unwrap_or(0),
        )
        .await?;
    if runs.is_empty() {
        return Ok(Json(RunsList { runs: Vec::new() }));
    }
    let mut out = Vec::with_capacity(runs.len());
    for r in runs {
        out.push(RunRecord {
            id: r.id,
            job_name: r.job_name,
            started_at: r.started_at,
            finished_at: r.finished_at,
            status: r.status,
            message: r.message,
            rows_affected: r.rows_affected,
        });
    }
    Ok(Json(RunsList { runs: out }))
}

#[derive(Deserialize)]
pub struct TriggerRequest {
    pub dry: Option<bool>,
}

pub async fn trigger_job(
    Path(name): Path<String>,
    Extension(state): Extension<HousekeepingState>,
    Json(body): Json<TriggerRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    if body.dry.unwrap_or(false) {
        let outcome = state.registry.dry_run_job_by_name(&state.db, &name).await?;
        Ok(Json(serde_json::json!({
            "job": name,
            "rows_affected": outcome.rows_affected,
            "message": outcome.message,
            "metadata": outcome.metadata,
        })))
    } else {
        let db = state.db.clone();
        let registry = state.registry.clone();
        let job_name = name.clone();

        tokio::spawn(async move {
            if let Err(err) = registry.run_job_by_name(&db, &job_name).await {
                error!(job_name = %job_name, error = %err, "manual job failed");
            }
        });

        Ok(Json(serde_json::json!({
            "job": name,
            "status": "queued",
        })))
    }
}

#[derive(Deserialize)]
pub struct ClearRunsBody {
    pub job: Option<String>,
}

#[derive(Serialize)]
pub struct ClearRunsResponse {
    pub deleted: i64,
}

pub async fn clear_runs(
    Extension(state): Extension<HousekeepingState>,
    Json(body): Json<ClearRunsBody>,
) -> Result<Json<ClearRunsResponse>, didhub_error::AppError> {
    let deleted = state
        .db
        .clear_housekeeping_runs(body.job.as_deref())
        .await?;
    Ok(Json(ClearRunsResponse { deleted }))
}
