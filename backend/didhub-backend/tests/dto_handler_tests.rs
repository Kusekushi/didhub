use didhub_backend::handlers::users::create;
// We'll inspect the HTTP response produced by ApiError via IntoResponse

mod support;

#[tokio::test]
async fn create_user_returns_structured_validation() {
    let pool = support::sqlite_pool().await;

    // create users table using full migrations schema
    sqlx::query(
        r#"CREATE TABLE users (
            id TEXT PRIMARY KEY,
            username TEXT NOT NULL,
            about_me TEXT,
            password_hash TEXT NOT NULL,
            avatar TEXT,
            must_change_password INTEGER NOT NULL,
            last_login_at TEXT,
            display_name TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            roles TEXT NOT NULL,
            settings TEXT NOT NULL
        )"#,
    )
    .execute(&pool)
    .await
    .expect("create table");

    let arc_state = support::test_state(&pool, &["admin"], None);

    // create user with empty username and short password so deserialization succeeds
    // and dto.validate() can return multiple validation issues
    let body = serde_json::json!({ "username": "", "passwordHash": "short" });
    let res = create::create(
        axum::Extension(arc_state.clone()),
        axum::http::HeaderMap::new(),
        Some(axum::Json(body)),
    )
    .await;
    match res {
        Ok(json_resp) => {
            // For validation errors, the handler returns Ok with validation payload
            let v = json_resp.0;
            assert!(
                v.get("validation").is_some(),
                "expected validation key in response JSON"
            );
        }
        Err(_) => panic!("expected Ok with validation payload"),
    }
}
