use crate::models::Db;
use anyhow::Result;

pub async fn update_entity(
    db: &Db,
    table: &str,
    id: &str,
    body: &serde_json::Value,
    fields: &[&str],
) -> Result<()> {
    if body.as_object().map(|m| m.is_empty()).unwrap_or(true) {
        return Ok(());
    }
    let mut sets: Vec<String> = Vec::new();
    let mut vals: Vec<(i32, serde_json::Value)> = Vec::new();
    let mut idx = 1;
    let mut bind_field = |key: &str| {
        if let Some(v) = body.get(key) {
            sets.push(format!("{}=?{}", key, idx));
            vals.push((idx, v.clone()));
            idx += 1;
        }
    };
    for k in fields {
        bind_field(k);
    }
    if sets.is_empty() {
        return Ok(());
    }
    let sql = format!("UPDATE {} SET {} WHERE id=?{}", table, sets.join(","), idx);
    let mut q = sqlx::query(&sql);
    vals.sort_by_key(|(i, _)| *i);
    for (_, v) in vals {
        q = match v {
            serde_json::Value::String(s) => q.bind(s),
            serde_json::Value::Number(n) => {
                if let Some(i) = n.as_i64() {
                    q.bind(i)
                } else if let Some(f) = n.as_f64() {
                    q.bind(f)
                } else {
                    q.bind(n.to_string())
                }
            }
            serde_json::Value::Bool(b) => q.bind(if b { 1 } else { 0 }),
            serde_json::Value::Null => q.bind(None::<String>),
            _ => q.bind(v.to_string()),
        };
    }
    q = q.bind(id);
    q.execute(&db.pool).await?;
    Ok(())
}

pub async fn delete_entity(db: &Db, table: &str, id: &str) -> Result<bool> {
    let res = sqlx::query(&format!("DELETE FROM {} WHERE id=?1", table))
        .bind(id)
        .execute(&db.pool)
        .await?;
    Ok(res.rows_affected() > 0)
}
