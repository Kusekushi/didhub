//! Client library for interacting with the DIDHub log collector tool binary.

use std::borrow::Cow;
use std::path::PathBuf;
use std::process::{Command, ExitStatus, Output};
use std::str::FromStr;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use thiserror::Error;
use uuid::Uuid;

/// Default binary name the client will attempt to execute if only a directory is provided.
const DEFAULT_TOOL_BINARY: &str = "didhub-log-collector";

/// Encapsulates interactions with the external log collector binary.
#[derive(Debug, Clone)]
pub struct LogToolClient {
    tool_path: PathBuf,
    storage: Option<PathBuf>,
}

impl LogToolClient {
    /// Build a client pointing to a concrete log tool binary.
    #[must_use]
    pub fn new<P: Into<PathBuf>>(tool_path: P) -> Self {
        Self {
            tool_path: tool_path.into(),
            storage: None,
        }
    }

    /// Build a client by combining a directory with the default binary name.
    #[must_use]
    pub fn from_directory<P: Into<PathBuf>>(dir: P) -> Self {
        let mut path = dir.into();
        path.push(DEFAULT_TOOL_BINARY);
        Self::new(path)
    }

    /// Override the storage path passed to the tool.
    #[must_use]
    pub fn with_storage<P: Into<PathBuf>>(mut self, storage: P) -> Self {
        self.storage = Some(storage.into());
        self
    }

    /// Append a new log entry to the collector.
    pub fn append(&self, request: AppendRequest) -> Result<AppendResponse, LogClientError> {
        let mut command = self.base_command();
        command.arg("append");
        command.arg("--category").arg(request.category.as_label());
        command.arg("--message").arg(&request.message);

        if let Some(source) = &request.source {
            command.arg("--source").arg(source);
        }

        if let Some(metadata) = &request.metadata {
            let metadata_json = serde_json::to_string(metadata)?;
            command.arg("--metadata").arg(metadata_json);
        }

        let output = run_command(command, "append")?;
        let stdout = String::from_utf8(output.stdout)?;
        let entry_id = parse_append_stdout(&stdout)?;

        Ok(AppendResponse { id: entry_id })
    }

    /// Append a log entry without metadata (optimized path).
    #[inline]
    pub fn append_simple(
        &self,
        category: LogCategory,
        message: &str,
    ) -> Result<AppendResponse, LogClientError> {
        let mut command = self.base_command();
        command
            .arg("append")
            .arg("--category")
            .arg(category.as_label())
            .arg("--message")
            .arg(message);

        let output = run_command(command, "append")?;
        let stdout = String::from_utf8(output.stdout)?;
        let entry_id = parse_append_stdout(&stdout)?;

        Ok(AppendResponse { id: entry_id })
    }

    /// Export log entries from the collector.
    pub fn export(&self, options: ExportOptions) -> Result<Vec<LogEntry>, LogClientError> {
        let mut command = self.base_command();
        command.arg("export");
        command.arg("--format").arg("json");

        if let Some(category) = options.category {
            command.arg("--category").arg(category.as_label());
        }

        if let Some(limit) = options.limit {
            command.arg("--limit").arg(limit.to_string());
        }

        if options.drain {
            command.arg("--drain");
        }

        let output = run_command(command, "export")?;
        let stdout = String::from_utf8(output.stdout)?;
        let entries: Vec<LogEntry> = serde_json::from_str(&stdout)?;
        Ok(entries)
    }

    /// Export entries and delete the underlying files.
    pub fn drain(&self, options: ExportOptions) -> Result<Vec<LogEntry>, LogClientError> {
        let mut drain_opts = options;
        drain_opts.drain = true;
        self.export(drain_opts)
    }

    /// Delete log data from the collector.
    pub fn delete(&self, category: Option<LogCategory>) -> Result<(), LogClientError> {
        let mut command = self.base_command();
        command.arg("delete");

        if let Some(cat) = category {
            command.arg("--category").arg(cat.as_label());
        }

        run_command(command, "delete")?;
        Ok(())
    }

    /// Retrieve storage statistics from the collector.
    pub fn status(&self) -> Result<Vec<StatusRecord>, LogClientError> {
        let mut command = self.base_command();
        command.arg("status");

        let output = run_command(command, "status")?;
        let stdout = String::from_utf8(output.stdout)?;
        parse_status_records(&stdout)
    }

    #[inline]
    fn base_command(&self) -> Command {
        let mut command = Command::new(&self.tool_path);
        if let Some(storage) = &self.storage {
            command.arg("--storage").arg(storage);
        }
        command
    }
}

/// Request payload for appending a log entry.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppendRequest {
    pub category: LogCategory,
    pub message: String,
    pub source: Option<String>,
    pub metadata: Option<Value>,
}

impl AppendRequest {
    /// Build a minimal request with the required fields.
    #[must_use]
    pub fn new<S: Into<String>>(category: LogCategory, message: S) -> Self {
        Self {
            category,
            message: message.into(),
            source: None,
            metadata: None,
        }
    }

    /// Attach a source descriptor to the request.
    #[inline]
    #[must_use]
    pub fn with_source<S: Into<String>>(mut self, source: S) -> Self {
        self.source = Some(source.into());
        self
    }

    /// Attach structured metadata to the request.
    #[inline]
    #[must_use]
    pub fn with_metadata(mut self, metadata: Value) -> Self {
        self.metadata = Some(metadata);
        self
    }
}

/// Response returned after appending an entry.
#[derive(Debug, Clone)]
pub struct AppendResponse {
    pub id: Option<Uuid>,
}

/// Options controlling how export operations behave.
#[derive(Debug, Clone, Copy)]
pub struct ExportOptions {
    pub category: Option<LogCategory>,
    pub limit: Option<usize>,
    pub drain: bool,
}

impl ExportOptions {
    #[must_use]
    pub const fn new() -> Self {
        Self {
            category: None,
            limit: None,
            drain: false,
        }
    }

    #[inline]
    #[must_use]
    pub const fn with_category(mut self, category: LogCategory) -> Self {
        self.category = Some(category);
        self
    }

    #[inline]
    #[must_use]
    pub const fn with_limit(mut self, limit: usize) -> Self {
        self.limit = Some(limit);
        self
    }

    #[inline]
    #[must_use]
    pub const fn draining(mut self, drain: bool) -> Self {
        self.drain = drain;
        self
    }
}

impl Default for ExportOptions {
    fn default() -> Self {
        Self::new()
    }
}

/// Structured representation of a log entry.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogEntry {
    pub id: Uuid,
    pub timestamp: DateTime<Utc>,
    pub category: LogCategory,
    pub message: String,
    pub source: Option<String>,
    pub metadata: Option<Value>,
}

/// Roll-up statistics produced by the status command.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StatusRecord {
    pub category: LogCategory,
    pub path: PathBuf,
    pub entries: usize,
    pub size_bytes: u64,
}

/// Categories supported by the collector.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, Eq, PartialEq)]
pub enum LogCategory {
    Audit,
    Job,
}

impl LogCategory {
    /// Returns the string label for this category.
    #[inline]
    #[must_use]
    pub const fn as_label(self) -> &'static str {
        match self {
            Self::Audit => "audit",
            Self::Job => "job",
        }
    }
}

impl FromStr for LogCategory {
    type Err = LogClientError;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        // Avoid allocation for common cases by checking lowercase manually
        if s.eq_ignore_ascii_case("audit") {
            Ok(Self::Audit)
        } else if s.eq_ignore_ascii_case("job") {
            Ok(Self::Job)
        } else {
            Err(LogClientError::UnexpectedOutput(Cow::Owned(format!(
                "unknown log category `{s}`"
            ))))
        }
    }
}

impl std::fmt::Display for LogCategory {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_label())
    }
}

/// Errors surfaced while communicating with the log collector binary.
#[derive(Debug, Error)]
#[non_exhaustive]
pub enum LogClientError {
    #[error("failed to invoke log tool: {0}")]
    Io(#[from] std::io::Error),
    #[error("log tool command `{command}` failed with status {status}: {stderr}")]
    ToolFailure {
        command: Cow<'static, str>,
        status: ExitStatus,
        stderr: String,
    },
    #[error("unable to decode log tool output as UTF-8: {0}")]
    InvalidUtf8(#[from] std::string::FromUtf8Error),
    #[error("failed to parse JSON payload: {0}")]
    Json(#[from] serde_json::Error),
    #[error("failed to parse UUID from tool output: {0}")]
    Uuid(#[from] uuid::Error),
    #[error("failed to parse numeric value: {0}")]
    ParseInt(#[from] std::num::ParseIntError),
    #[error("log tool returned unexpected output: {0}")]
    UnexpectedOutput(Cow<'static, str>),
}

#[inline]
fn run_command(mut command: Command, name: &'static str) -> Result<Output, LogClientError> {
    let output = command.output()?;
    if output.status.success() {
        Ok(output)
    } else {
        let stderr = match String::from_utf8(output.stderr) {
            Ok(s) => s.trim().to_owned(),
            Err(e) => String::from_utf8_lossy(e.as_bytes()).trim().to_owned(),
        };
        Err(LogClientError::ToolFailure {
            command: Cow::Borrowed(name),
            status: output.status,
            stderr,
        })
    }
}

#[inline]
fn parse_append_stdout(stdout: &str) -> Result<Option<Uuid>, LogClientError> {
    // Fast path: check if "stored" appears at all
    if !stdout.contains("stored") {
        return Ok(None);
    }

    for line in stdout.lines() {
        let trimmed = line.trim();
        if let Some(rest) = trimmed.strip_prefix("stored") {
            let id_part = rest.trim_start_matches(['\t', ' ']);
            if id_part.is_empty() {
                return Ok(None);
            }
            return Ok(Some(Uuid::parse_str(id_part)?));
        }
    }
    Ok(None)
}

fn parse_status_records(stdout: &str) -> Result<Vec<StatusRecord>, LogClientError> {
    // Pre-allocate based on line count estimate
    let line_count = stdout.lines().filter(|l| !l.trim().is_empty()).count();
    let mut records = Vec::with_capacity(line_count);

    for line in stdout.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        let mut parts = trimmed.split('\t');
        let category_str = parts.next().ok_or_else(|| {
            LogClientError::UnexpectedOutput(Cow::Borrowed("missing category column"))
        })?;
        let category = LogCategory::from_str(category_str)?;

        let mut path: Option<PathBuf> = None;
        let mut entries: Option<usize> = None;
        let mut size_bytes: Option<u64> = None;

        for part in parts {
            if let Some(raw_path) = part.strip_prefix("path=") {
                path = Some(PathBuf::from(trim_path(raw_path).as_ref()));
            } else if let Some(raw_entries) = part.strip_prefix("entries=") {
                entries = Some(raw_entries.parse()?);
            } else if let Some(raw_size) = part.strip_prefix("size_bytes=") {
                size_bytes = Some(raw_size.parse()?);
            }
        }

        records.push(StatusRecord {
            category,
            path: path.ok_or_else(|| {
                LogClientError::UnexpectedOutput(Cow::Owned(format!(
                    "missing path for category {category}"
                )))
            })?,
            entries: entries.ok_or_else(|| {
                LogClientError::UnexpectedOutput(Cow::Owned(format!(
                    "missing entry count for category {category}"
                )))
            })?,
            size_bytes: size_bytes.ok_or_else(|| {
                LogClientError::UnexpectedOutput(Cow::Owned(format!(
                    "missing size for category {category}"
                )))
            })?,
        });
    }

    Ok(records)
}

#[inline]
fn trim_path(raw: &str) -> Cow<'_, str> {
    let trimmed = raw.trim();
    let unquoted = trimmed
        .strip_prefix('"')
        .and_then(|inner| inner.strip_suffix('"'))
        .unwrap_or(trimmed);

    // Only allocate if escape sequences are present
    if unquoted.contains("\\\\") {
        Cow::Owned(unquoted.replace("\\\\", "\\"))
    } else {
        Cow::Borrowed(unquoted)
    }
}
