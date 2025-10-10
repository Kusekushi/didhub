use axum::extract::{Extension, Json};
use didhub_db::{audit, Db};
use didhub_error::AppError;
use didhub_middleware::types::CurrentUser;
use sqlx::{Column, Row, ValueRef};
use tracing::{debug, error, info, warn};

#[derive(serde::Deserialize)]
pub struct QueryRequest {
    pub sql: String,
    pub limit: Option<i64>,
}

#[derive(serde::Serialize)]
pub struct QueryResponse {
    pub success: bool,
    pub columns: Vec<String>,
    pub rows: Vec<serde_json::Value>,
    pub row_count: usize,
    pub message: Option<String>,
}

pub async fn query_database(
    Extension(user): Extension<CurrentUser>,
    Extension(db): Extension<Db>,
    Json(req): Json<QueryRequest>,
) -> Result<Json<QueryResponse>, AppError> {
    if !user.is_admin {
        warn!(user_id=%user.id, username=%user.username, "unauthorized attempt to query database");
        return Err(AppError::Forbidden);
    }

    let sql = req.sql.trim().to_uppercase();
    if !sql.starts_with("SELECT") {
        return Ok(Json(QueryResponse {
            success: false,
            columns: vec![],
            rows: vec![],
            row_count: 0,
            message: Some("Only SELECT queries are allowed".to_string()),
        }));
    }

    debug!(user_id=%user.id, sql=%req.sql, "executing database query");

    let limit = req.limit.unwrap_or(1000).min(10000);

    let rows = sqlx::query(&req.sql)
        .fetch_all(&db.pool)
        .await
        .map_err(|e| {
            error!(user_id=%user.id, sql=%req.sql, error=%e, "database query failed");
            AppError::BadRequest(format!("Query failed: {}", e))
        })?;

    let row_count = rows.len();
    let limited_rows: Vec<_> = rows.into_iter().take(limit as usize).collect();

    let mut columns: Vec<String> = vec![];
    let mut json_rows = vec![];

    if let Some(first_row) = limited_rows.first() {
        columns = (0..first_row.len())
            .map(|i| first_row.column(i).name().to_string())
            .collect();
    }

    for row in limited_rows {
        let mut json_row = serde_json::Map::new();
        for (i, column) in columns.iter().enumerate() {
            let value: serde_json::Value = match row.try_get_raw(i) {
                Ok(raw) => {
                    if raw.is_null() {
                        serde_json::Value::Null
                    } else if let Ok(v) = row.try_get::<String, _>(i) {
                        serde_json::Value::String(v)
                    } else if let Ok(v) = row.try_get::<i64, _>(i) {
                        serde_json::Value::Number(v.into())
                    } else if let Ok(v) = row.try_get::<f64, _>(i) {
                        serde_json::Number::from_f64(v)
                            .map_or(serde_json::Value::Null, serde_json::Value::Number)
                    } else if let Ok(v) = row.try_get::<bool, _>(i) {
                        serde_json::Value::Bool(v)
                    } else {
                        serde_json::Value::String(format!("{:?}", raw))
                    }
                }
                Err(_) => serde_json::Value::Null,
            };
            json_row.insert(column.clone(), value);
        }
        json_rows.push(serde_json::Value::Object(json_row));
    }

    info!(user_id=%user.id, row_count=%row_count, "database query executed successfully");

    audit::record_with_metadata(
        &db,
        Some(user.id.as_str()),
        "admin.db.query",
        Some("database"),
        None,
        serde_json::json!({
            "sql": req.sql,
            "row_count": row_count,
            "limited": row_count > limit as usize
        }),
    )
    .await;

    Ok(Json(QueryResponse {
        success: true,
        columns,
        rows: json_rows,
        row_count,
        message: if row_count > limit as usize {
            Some(format!("Results limited to {} rows", limit))
        } else {
            None
        },
    }))
}
