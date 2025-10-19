use std::collections::HashMap;
use std::path::PathBuf;
use std::process::Command;
use std::sync::{Arc, OnceLock};

use axum::{extract::Extension, extract::Query, http::HeaderMap};
use chrono::{Duration, Utc};
use didhub_auth::{AuthenticatorTrait, TestAuthenticator};
use didhub_backend::{handlers::audit_logs, state::AppState};
use didhub_db::{create_pool, DbConnectionConfig};
use didhub_job_queue::JobQueueClient;
use didhub_log_client::{LogCategory, LogToolClient};
use didhub_updates::UpdateCoordinator;
use std::fs::File;
use std::io::{BufWriter, Write};
use tempfile::{Builder, TempDir};
use uuid::Uuid;

const LOG_TOOL_STUB_SOURCE: &str = r#"use std::env;
use std::fs::{self, File};
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};

struct Entry {
    id: String,
    timestamp: String,
    message: String,
    actor: String,
}

fn main() {
    let mut storage: Option<PathBuf> = None;
    let mut command_args = Vec::new();

    let mut iter = env::args().skip(1);
    while let Some(arg) = iter.next() {
        if arg == "--storage" {
            if let Some(path) = iter.next() {
                storage = Some(PathBuf::from(path));
            }
        } else {
            command_args.push(arg);
        }
    }

    if command_args.is_empty() {
        std::process::exit(1);
    }

    let command = command_args.remove(0);
    let storage = storage.unwrap_or_else(|| env::current_dir().unwrap());

    match command.as_str() {
        "status" => status(&storage),
        "delete" => delete(&storage),
        "export" => export(&storage, &command_args),
        "append" => std::process::exit(0),
        _ => std::process::exit(1),
    }
}

fn status(storage: &Path) {
    let entries = read_entries(storage);
    let path = storage.join("audit.log");
    let size = fs::metadata(&path).map(|meta| meta.len()).unwrap_or(0);
    println!(
        "audit\tpath=\"{}\"\tentries={}\tsize_bytes={}",
        path.display(),
        entries.len(),
        size
    );
}

fn delete(storage: &Path) {
    let path = storage.join("audit.log");
    let _ = fs::remove_file(path);
}

fn export(storage: &Path, args: &[String]) {
    let mut limit: Option<usize> = None;
    let mut drain = false;
    let mut index = 0;
    while index < args.len() {
        match args[index].as_str() {
            "--limit" => {
                index += 1;
                if index < args.len() {
                    if let Ok(value) = args[index].parse::<usize>() {
                        limit = Some(value);
                    }
                }
            }
            "--drain" => {
                drain = true;
            }
            _ => {}
        }
        index += 1;
    }

    let mut entries = read_entries(storage);
    entries.sort_by(|a, b| a.timestamp.cmp(&b.timestamp));
    if let Some(limit) = limit {
        if entries.len() > limit {
            entries = entries.split_off(entries.len() - limit);
        }
    }

    let mut output = String::from("[");
    for (pos, entry) in entries.iter().enumerate() {
        if pos > 0 {
            output.push(',');
        }
        output.push_str(&format!(
            "{{\"id\":\"{}\",\"timestamp\":\"{}\",\"category\":\"Audit\",\"message\":{},\"source\":null,\"metadata\":{{\"actor\":{}}}}}",
            entry.id,
            entry.timestamp,
            json_escape(&entry.message),
            json_escape(&entry.actor)
        ));
    }
    output.push(']');
    println!("{}", output);

    if drain {
        delete(storage);
    }
}

fn read_entries(storage: &Path) -> Vec<Entry> {
    let path = storage.join("audit.log");
    let file = match File::open(&path) {
        Ok(file) => file,
        Err(_) => return Vec::new(),
    };
    let reader = BufReader::new(file);
    let mut entries = Vec::new();
    for line in reader.lines().filter_map(Result::ok) {
        if line.trim().is_empty() {
            continue;
        }
        let parts: Vec<&str> = line.splitn(4, '|').collect();
        if parts.len() != 4 {
            continue;
        }
        entries.push(Entry {
            id: parts[0].to_string(),
            timestamp: parts[1].to_string(),
            message: parts[2].to_string(),
            actor: parts[3].to_string(),
        });
    }
    entries
}

fn json_escape(input: &str) -> String {
    let mut escaped = String::from("\"");
    for ch in input.chars() {
        match ch {
            '\\' => escaped.push_str("\\\\"),
            '"' => escaped.push_str("\\\""),
            '\n' => escaped.push_str("\\n"),
            '\r' => escaped.push_str("\\r"),
            '\t' => escaped.push_str("\\t"),
            _ => escaped.push(ch),
        }
    }
    escaped.push('"');
    escaped
}
"#;

fn ensure_log_collector_binary() -> PathBuf {
    static BINARY: OnceLock<PathBuf> = OnceLock::new();
    BINARY
        .get_or_init(|| {
            let target_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("..")
                .join("target")
                .join("test-logs");
            std::fs::create_dir_all(&target_dir).expect("create stub target directory");

            let binary_name = if cfg!(windows) {
                "log_tool_stub.exe"
            } else {
                "log_tool_stub"
            };
            let binary_path = target_dir.join(binary_name);
            if binary_path.exists() {
                return binary_path;
            }

            let source_path = target_dir.join("log_tool_stub.rs");
            std::fs::write(&source_path, LOG_TOOL_STUB_SOURCE).expect("write log tool stub source");

            let status = Command::new("rustc")
                .arg("--edition=2021")
                .arg(&source_path)
                .arg("-O")
                .arg("-o")
                .arg(&binary_path)
                .status()
                .expect("failed to compile log tool stub");

            assert!(status.success(), "compiling log tool stub failed");
            binary_path
        })
        .clone()
}

fn admin_authenticator(user_id: Option<Uuid>) -> Arc<dyn AuthenticatorTrait> {
    Arc::from(Box::new(TestAuthenticator::new_with(
        vec!["admin".to_string()],
        user_id,
    )) as Box<dyn AuthenticatorTrait>)
}

fn new_log_client() -> (LogToolClient, TempDir) {
    let binary = ensure_log_collector_binary();
    let storage_root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("target")
        .join("test-logs");
    std::fs::create_dir_all(&storage_root).expect("create test log root");
    let storage = Builder::new()
        .prefix("audit-")
        .tempdir_in(storage_root)
        .expect("create scoped log storage directory");
    let client = LogToolClient::new(binary).with_storage(storage.path());
    (client, storage)
}

fn seed_audit_entries(storage: &TempDir, entries: &[(&str, &str)]) {
    let file_path = storage.path().join("audit.log");
    let file = File::create(&file_path).expect("create audit log file");
    let mut writer = BufWriter::new(file);
    for (index, (message, actor)) in entries.iter().enumerate() {
        let timestamp = (Utc::now() + Duration::milliseconds(index as i64)).to_rfc3339();
        let id = Uuid::new_v4();
        writeln!(writer, "{id}|{timestamp}|{message}|{actor}").expect("write audit entry line");
    }
    writer.flush().expect("flush audit log file");
}

async fn build_state(log_client: LogToolClient) -> Arc<AppState> {
    let config = DbConnectionConfig::new("sqlite::memory:");
    let pool = create_pool(&config).await.expect("create pool");
    let authenticator = admin_authenticator(Some(Uuid::new_v4()));

    Arc::new(AppState::new(
        pool,
        log_client,
        authenticator,
        JobQueueClient::new(),
        UpdateCoordinator::new(),
    ))
}

fn auth_headers() -> HeaderMap {
    let mut headers = HeaderMap::new();
    headers.insert(
        axum::http::header::AUTHORIZATION,
        axum::http::HeaderValue::from_static("Bearer test-token"),
    );
    headers
}

#[tokio::test]
async fn list_audit_logs_returns_entries() {
    let (log_client, storage) = new_log_client();
    let state = build_state(log_client.clone()).await;

    seed_audit_entries(
        &storage,
        &[("first event", "tester"), ("second event", "admin")],
    );

    let mut query_params = HashMap::new();
    query_params.insert("perPage".to_string(), "10".to_string());

    let response = audit_logs::list_audit_logs(
        Extension(state.clone()),
        auth_headers(),
        Some(Query(query_params)),
    )
    .await
    .expect("list audit logs");

    let body = response.0;
    let items = body
        .get("items")
        .and_then(|value| value.as_array())
        .expect("items array");
    assert_eq!(items.len(), 2);
    assert_eq!(
        items[0].get("message").and_then(|value| value.as_str()),
        Some("second event")
    );
    assert_eq!(
        items[0].get("actor").and_then(|value| value.as_str()),
        Some("admin")
    );
    assert_eq!(
        items[1].get("message").and_then(|value| value.as_str()),
        Some("first event")
    );
    assert_eq!(
        items[1].get("actor").and_then(|value| value.as_str()),
        Some("tester")
    );

    let pagination = body
        .get("pagination")
        .and_then(|value| value.as_object())
        .expect("pagination object");
    assert_eq!(
        pagination.get("total").and_then(|value| value.as_u64()),
        Some(2)
    );
    assert_eq!(
        pagination.get("page").and_then(|value| value.as_u64()),
        Some(1)
    );
    assert_eq!(
        pagination.get("perPage").and_then(|value| value.as_u64()),
        Some(10)
    );
}

#[tokio::test]
async fn list_audit_logs_supports_pagination() {
    let (log_client, storage) = new_log_client();
    let state = build_state(log_client.clone()).await;

    seed_audit_entries(
        &storage,
        &[
            ("event 1", "actor1"),
            ("event 2", "actor2"),
            ("event 3", "actor3"),
        ],
    );

    let mut query_params = HashMap::new();
    query_params.insert("perPage".to_string(), "2".to_string());
    query_params.insert("page".to_string(), "2".to_string());

    let response = audit_logs::list_audit_logs(
        Extension(state.clone()),
        auth_headers(),
        Some(Query(query_params)),
    )
    .await
    .expect("list paginated audit logs");

    let body = response.0;
    let items = body
        .get("items")
        .and_then(|value| value.as_array())
        .expect("items array");

    assert_eq!(items.len(), 1);
    assert_eq!(
        items[0].get("message").and_then(|value| value.as_str()),
        Some("event 1")
    );

    let pagination = body
        .get("pagination")
        .and_then(|value| value.as_object())
        .expect("pagination object");
    assert_eq!(
        pagination.get("total").and_then(|value| value.as_u64()),
        Some(3)
    );
    assert_eq!(
        pagination.get("page").and_then(|value| value.as_u64()),
        Some(2)
    );
    assert_eq!(
        pagination.get("perPage").and_then(|value| value.as_u64()),
        Some(2)
    );
}

#[tokio::test]
async fn clear_audit_logs_removes_all_entries() {
    let (log_client, storage) = new_log_client();
    let state = build_state(log_client.clone()).await;

    seed_audit_entries(&storage, &[("cleanup target", "system")]);

    let response = audit_logs::clear_audit_logs(Extension(state.clone()), auth_headers())
        .await
        .expect("clear audit logs");

    assert_eq!(
        response.0.get("cleared").and_then(|value| value.as_bool()),
        Some(true)
    );

    let remaining = log_client
        .status()
        .expect("fetch status")
        .into_iter()
        .find(|record| record.category == LogCategory::Audit)
        .map(|record| record.entries)
        .unwrap_or(0);
    assert_eq!(remaining, 0);

    let mut query_params = HashMap::new();
    query_params.insert("perPage".to_string(), "5".to_string());

    let list_after_clear = audit_logs::list_audit_logs(
        Extension(state.clone()),
        auth_headers(),
        Some(Query(query_params)),
    )
    .await
    .expect("list after clear");

    let items = list_after_clear
        .0
        .get("items")
        .and_then(|value| value.as_array())
        .expect("items array");
    assert!(items.is_empty());
}
