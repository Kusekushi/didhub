//! Job queue client implementation.

use std::collections::{HashMap, VecDeque};
use std::fmt;
use std::sync::Arc;

use tokio::sync::RwLock;
use uuid::Uuid;

use crate::error::JobQueueError;
use crate::executor::JobExecutor;
use crate::types::{EnqueueResult, JobRequest, JobRun, JobStatus};

/// Maximum number of job runs to keep in memory.
const MAX_JOB_RUNS: usize = 1000;

/// Internal storage optimized for both iteration and lookup by ID.
#[derive(Debug, Default)]
struct JobQueueState {
    /// Ordered list of job run IDs (oldest first).
    order: VecDeque<Uuid>,
    /// Map from ID to job run for O(1) lookup.
    runs: HashMap<Uuid, JobRun>,
}

impl JobQueueState {
    /// Insert a new job run, maintaining the size limit.
    fn insert(&mut self, run: JobRun) {
        let id = run.id;
        self.runs.insert(id, run);
        self.order.push_back(id);

        // Trim old runs if we exceed the limit
        while self.order.len() > MAX_JOB_RUNS {
            if let Some(old_id) = self.order.pop_front() {
                self.runs.remove(&old_id);
            }
        }
    }

    /// Get a job run by ID.
    #[inline]
    fn get(&self, id: &Uuid) -> Option<&JobRun> {
        self.runs.get(id)
    }

    /// Get a mutable reference to a job run by ID.
    #[inline]
    fn get_mut(&mut self, id: &Uuid) -> Option<&mut JobRun> {
        self.runs.get_mut(id)
    }

    /// Iterate over all runs in reverse order (most recent first).
    fn iter_recent(&self) -> impl Iterator<Item = &JobRun> {
        self.order.iter().rev().filter_map(|id| self.runs.get(id))
    }

    /// Count runs, optionally filtered by job name.
    fn count(&self, job_name: Option<&str>) -> usize {
        match job_name {
            Some(name) => self.runs.values().filter(|r| r.job_name == name).count(),
            None => self.runs.len(),
        }
    }

    /// Clear all runs.
    fn clear(&mut self) {
        self.order.clear();
        self.runs.clear();
    }
}

/// Interface for enqueuing jobs and tracking their execution.
#[derive(Clone)]
pub struct JobQueueClient {
    state: Arc<RwLock<JobQueueState>>,
    executors: Arc<RwLock<HashMap<String, Arc<dyn JobExecutor>>>>,
}

impl fmt::Debug for JobQueueClient {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("JobQueueClient")
            .field("state", &"<RwLock<JobQueueState>>")
            .field(
                "executors",
                &"<RwLock<HashMap<String, Arc<dyn JobExecutor>>>>",
            )
            .finish()
    }
}

impl Default for JobQueueClient {
    fn default() -> Self {
        Self::new()
    }
}

impl JobQueueClient {
    pub fn new() -> Self {
        Self {
            state: Arc::new(RwLock::new(JobQueueState::default())),
            executors: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Register a job executor for a specific job type.
    pub async fn register_executor<E: JobExecutor + 'static>(&self, executor: E) {
        let job_type = executor.job_type().to_owned();
        let mut executors = self.executors.write().await;
        executors.insert(job_type, Arc::new(executor));
    }

    /// Enqueue a job for asynchronous processing.
    pub async fn enqueue(&self, request: JobRequest) -> Result<EnqueueResult, JobQueueError> {
        let job_id = Uuid::new_v4();

        let run = JobRun::with_id(job_id, &request.job_type, Some(request.payload));

        // Store the run
        let mut state = self.state.write().await;
        state.insert(run);

        Ok(EnqueueResult { job_id })
    }

    /// Run a named job immediately and track it.
    ///
    /// If an executor is registered for this job type, it will be used.
    /// Otherwise, the job completes immediately (stub behavior).
    pub async fn run_job(
        &self,
        job_name: impl Into<String>,
        payload: Option<serde_json::Value>,
    ) -> Result<JobRun, JobQueueError> {
        let job_name = job_name.into();
        let mut run = JobRun::new(&job_name, payload.clone());
        run.start();

        // Try to find an executor
        let executor = {
            let executors = self.executors.read().await;
            executors.get(&job_name).cloned()
        };

        // Execute if we have an executor, otherwise just complete (stub)
        if let Some(executor) = executor {
            let exec_payload = payload.unwrap_or(serde_json::Value::Null);
            match executor.execute(exec_payload).await {
                Ok(()) => run.complete(),
                Err(e) => run.fail(e.to_string()),
            }
        } else {
            // Stub: complete immediately
            run.complete();
        }

        // Store the run
        let mut state = self.state.write().await;
        state.insert(run.clone());

        Ok(run)
    }

    /// List all job runs, optionally filtered by job name.
    pub async fn list_runs(
        &self,
        job_name: Option<&str>,
        limit: usize,
        offset: usize,
    ) -> Vec<JobRun> {
        let state = self.state.read().await;

        let iter = state.iter_recent();

        match job_name {
            Some(name) => iter
                .filter(|r| r.job_name == name)
                .skip(offset)
                .take(limit)
                .cloned()
                .collect(),
            None => iter.skip(offset).take(limit).cloned().collect(),
        }
    }

    /// Get total count of job runs, optionally filtered by job name.
    pub async fn count_runs(&self, job_name: Option<&str>) -> usize {
        let state = self.state.read().await;
        state.count(job_name)
    }

    /// Clear all job runs.
    pub async fn clear_runs(&self) {
        let mut state = self.state.write().await;
        state.clear();
    }

    /// Get a specific job run by ID.
    pub async fn get_run(&self, id: Uuid) -> Option<JobRun> {
        let state = self.state.read().await;
        state.get(&id).cloned()
    }

    /// Update the status of a job run.
    pub async fn update_run_status(
        &self,
        id: Uuid,
        status: JobStatus,
        error_message: Option<String>,
    ) -> Option<JobRun> {
        let mut state = self.state.write().await;
        if let Some(run) = state.get_mut(&id) {
            run.status = status;
            if status.is_terminal() {
                run.finished_at = Some(chrono::Utc::now());
            }
            run.error_message = error_message;
            Some(run.clone())
        } else {
            None
        }
    }
}
