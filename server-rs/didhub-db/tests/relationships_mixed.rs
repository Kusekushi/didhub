use sqlx::SqlitePool;
use sqlx::Row;
use anyhow::Result;

#[tokio::test]
async fn mixed_user_alter_and_user_user_spouse_tests() -> Result<()> {
    let url = "sqlite::memory:?cache=shared";
    let pool = SqlitePool::connect(url).await?;
    didhub_migrations::sqlite_migrator().run(&pool).await?;

    // create two users and one alter
    sqlx::query("INSERT INTO users (id, username, password_hash, created_at) VALUES ('mu_u1','user_a','x', datetime('now'))")
        .execute(&pool).await?;
    sqlx::query("INSERT INTO users (id, username, password_hash, created_at) VALUES ('mu_u2','user_b','x', datetime('now'))")
        .execute(&pool).await?;
    sqlx::query("INSERT INTO alters (id, name, owner_user_id, created_at) VALUES ('mu_a1','Alt1','mu_u1', datetime('now'))")
        .execute(&pool).await?;

    // Insert user<->alter spouse via raw SQL using mixed identifiers logic: user is user_a (mu_u1), alter is mu_a1
    let rel1 = uuid::Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO person_relationships (id, type, person_a_user_id, person_b_alter_id, is_past_life, created_at) VALUES (?1,'spouse',?2,?3,0, datetime('now'))")
        .bind(&rel1).bind("mu_u1").bind("mu_a1").execute(&pool).await?;

    // Verify user entries
    let rows = sqlx::query("SELECT * FROM person_relationships WHERE person_a_user_id = 'mu_u1' OR person_b_user_id = 'mu_u1'")
        .fetch_all(&pool).await?;
    assert!(!rows.is_empty());

    // Insert user<->user spouse
    let rel2 = uuid::Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO person_relationships (id, type, person_a_user_id, person_b_user_id, is_past_life, created_at) VALUES (?1,'spouse',?2,?3,0, datetime('now'))")
        .bind(&rel2).bind("mu_u1").bind("mu_u2").execute(&pool).await?;

    // Attempt to insert duplicate inverted order should fail due to unique index for current life
    let res = sqlx::query("INSERT INTO person_relationships (id, type, person_a_user_id, person_b_user_id, is_past_life, created_at) VALUES (?1,'spouse',?2,?3,0, datetime('now'))")
        .bind(uuid::Uuid::new_v4().to_string()).bind("mu_u2").bind("mu_u1").execute(&pool).await;
    assert!(res.is_err());

    // Past-life: insert same canonical pair with is_past_life=1 should succeed
    let rel_past = uuid::Uuid::new_v4().to_string();
    let res_past = sqlx::query("INSERT INTO person_relationships (id, type, person_a_user_id, person_b_user_id, is_past_life, created_at) VALUES (?1,'spouse',?2,?3,1, datetime('now'))")
        .bind(&rel_past).bind("mu_u1").bind("mu_u2").execute(&pool).await?;
    assert!(res_past.rows_affected() > 0);

    Ok(())
}
