//! Lightweight job queue abstraction used by the backend.
//!
//! This crate provides a simple job queue interface that can be used to enqueue
//! and track job execution. The initial implementation is an in-memory stub so
//! the backend can be wired together and exercised without provisioning the real
//! queue infrastructure.
//!
//! # Architecture
//!
//! - [`JobQueueClient`] - The main interface for enqueuing and tracking jobs
//! - [`JobExecutor`] - Trait for implementing job handlers
//! - [`JobRun`] - A record of a job execution
//! - [`JobRequest`] - A request to enqueue a job
//!
//! # Example
//!
//! ```rust,no_run
//! use didhub_job_queue::{JobQueueClient, JobRequest, JobExecutor, JobQueueError};
//! use serde_json::json;
//! use async_trait::async_trait;
//!
//! struct MyJobExecutor;
//!
//! #[async_trait]
//! impl JobExecutor for MyJobExecutor {
//!     fn job_type(&self) -> &str {
//!         "my.job"
//!     }
//!
//!     async fn execute(&self, payload: serde_json::Value) -> Result<(), JobQueueError> {
//!         println!("Executing job with payload: {}", payload);
//!         Ok(())
//!     }
//! }
//!
//! #[tokio::main]
//! async fn main() {
//!     let client = JobQueueClient::new();
//!     
//!     // Register an executor
//!     client.register_executor(MyJobExecutor).await;
//!     
//!     // Enqueue a job
//!     let request = JobRequest::new("my.job", json!({"key": "value"}));
//!     let result = client.enqueue(request).await.unwrap();
//!     println!("Enqueued job: {}", result.job_id);
//! }
//! ```

mod client;
mod error;
mod executor;
mod types;

pub use client::JobQueueClient;
pub use error::JobQueueError;
pub use executor::{JobExecutor, NoOpExecutor};
pub use types::{EnqueueResult, JobRequest, JobRun, JobStatus};

// Re-export async_trait for convenience when implementing JobExecutor
pub use async_trait::async_trait;
