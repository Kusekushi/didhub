use axum::{
    extract::{Path, Query},
    Extension, Json,
};
use didhub_db::{common::CommonOperations, Db};
use didhub_error::AppError;
use didhub_scheduler::CronScheduler;
use serde::{Deserialize, Serialize};

#[derive(Clone)]
pub struct HousekeepingState {
    pub db: Db,
    pub registry: CronScheduler,
}

#[derive(Serialize)]
pub struct JobsList {
    pub jobs: Vec<String>,
}

pub async fn list_jobs(Extension(state): Extension<HousekeepingState>) -> Json<JobsList> {
    let jobs = state.registry.list_jobs().await;
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

#[derive(Serialize)]
pub struct TriggerResponse {
    pub job: String,
    pub rows_affected: i64,
    pub message: String,
}

pub async fn trigger_job(
    Path(name): Path<String>,
    Extension(state): Extension<HousekeepingState>,
) -> Result<Json<TriggerResponse>, AppError> {
    let outcome = state.registry.run_job_by_name(&state.db, &name).await?;
    Ok(Json(TriggerResponse {
        job: name,
        rows_affected: outcome.rows_affected,
        message: outcome.message.unwrap_or_default(),
    }))
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
