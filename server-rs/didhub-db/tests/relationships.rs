use anyhow::Result;
use sqlx::{Row, SqlitePool};

#[tokio::test]
async fn person_relationships_spouse_canonicalization() -> Result<()> {
    // create in-memory sqlite
    let url = "sqlite::memory:?cache=shared";
    let pool = SqlitePool::connect(url).await?;

    // run migrations from didhub-migrations crate
    didhub_migrations::sqlite_migrator().run(&pool).await?;

    // insert test users/alters seeded by migration already exist; but migration seeds used fixed ids 'user_u1' etc
    // create test users and alters
    sqlx::query("INSERT INTO users (id, username, password_hash, created_at) VALUES ('user_u1','alice','x', datetime('now'))")
        .execute(&pool).await?;
    sqlx::query("INSERT INTO users (id, username, password_hash, created_at) VALUES ('user_u2','bob','x', datetime('now'))")
        .execute(&pool).await?;

    // attempt to insert a duplicate spouse (inverted order) and ensure uniqueness
    sqlx::query("INSERT INTO person_relationships (id, type, person_a_user_id, person_b_user_id, is_past_life, created_at) VALUES ('t_rel_test','spouse','user_u2','user_u1',0, datetime('now'))")
        .execute(&pool)
        .await?;

    let res = sqlx::query("INSERT INTO person_relationships (id, type, person_a_user_id, person_b_user_id, is_past_life, created_at) VALUES ('t_rel_test_dup','spouse','user_u1','user_u2',0, datetime('now'))")
        .execute(&pool)
        .await;
    assert!(res.is_err(), "Duplicate spouse insertion should fail");

    // Update a spouse row to inverted form and ensure canonical columns maintain ordering
    sqlx::query("UPDATE person_relationships SET person_a_user_id='user_u2', person_b_user_id='user_u1' WHERE id='t_rel_test'")
        .execute(&pool)
        .await?;

    let row = sqlx::query(
        "SELECT canonical_a, canonical_b FROM person_relationships WHERE id='t_rel_test'",
    )
    .fetch_one(&pool)
    .await?;
    let ca: String = row.try_get("canonical_a")?;
    let cb: String = row.try_get("canonical_b")?;
    assert!(ca <= cb);

    Ok(())
}

#[tokio::test]
async fn person_relationships_parent_and_reflexive() -> Result<()> {
    let url = "sqlite::memory:?cache=shared";
    let pool = SqlitePool::connect(url).await?;
    didhub_migrations::sqlite_migrator().run(&pool).await?;

    // create user and an alter
    sqlx::query("INSERT INTO users (id, username, password_hash, created_at) VALUES ('p_u1','parent','x', datetime('now'))")
        .execute(&pool).await?;
    sqlx::query("INSERT INTO alters (id, name, owner_user_id, created_at) VALUES ('p_a1','child','p_u1', datetime('now'))")
        .execute(&pool).await?;

    // parent -> child should insert
    sqlx::query("INSERT INTO person_relationships (id, type, person_a_user_id, person_b_alter_id, is_past_life, created_at) VALUES ('p_rel1','parent','p_u1','p_a1',0, datetime('now'))")
        .execute(&pool).await?;

    // reflexive prevention: can't create relationship from entity to itself (user -> same user)
    let res = sqlx::query("INSERT INTO person_relationships (id, type, person_a_user_id, person_b_user_id, is_past_life, created_at) VALUES ('p_rel_bad','parent','p_u1','p_u1',0, datetime('now'))")
        .execute(&pool)
        .await;
    assert!(res.is_err(), "Should not allow reflexive relationships");

    Ok(())
}

#[tokio::test]
async fn person_relationships_past_life_separation() -> Result<()> {
    let url = "sqlite::memory:?cache=shared";
    let pool = SqlitePool::connect(url).await?;
    didhub_migrations::sqlite_migrator().run(&pool).await?;

    // create two users
    sqlx::query("INSERT INTO users (id, username, password_hash, created_at) VALUES ('pl_u1','u1','x', datetime('now'))")
        .execute(&pool).await?;
    sqlx::query("INSERT INTO users (id, username, password_hash, created_at) VALUES ('pl_u2','u2','x', datetime('now'))")
        .execute(&pool).await?;

    // Add spouse in current life
    sqlx::query("INSERT INTO person_relationships (id, type, person_a_user_id, person_b_user_id, is_past_life, created_at) VALUES ('pl_rel1','spouse','pl_u1','pl_u2',0, datetime('now'))")
        .execute(&pool).await?;

    // Add spouse in past life (same canonical pair but is_past_life=1) -> should be allowed
    let res = sqlx::query("INSERT INTO person_relationships (id, type, person_a_user_id, person_b_user_id, is_past_life, created_at) VALUES ('pl_rel2','spouse','pl_u2','pl_u1',1, datetime('now'))")
        .execute(&pool)
        .await;
    assert!(res.is_ok(), "Past-life separate spouse should be allowed even if canonical pair exists for current life");

    Ok(())
}
