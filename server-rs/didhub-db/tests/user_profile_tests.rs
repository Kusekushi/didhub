use anyhow::Result;
use didhub_db::users::UserOperations;
use didhub_db::{Db, NewUser, UpdateUserFields};

#[tokio::test]
async fn update_about_me_set_and_clear() -> Result<()> {
    // create an AnyPool for in-memory sqlite and run migrations
    let url = "sqlite::memory:?cache=shared";
    // Ensure drivers are installed for sqlx::any
    sqlx::any::install_default_drivers();
    let pool = sqlx::any::AnyPoolOptions::new()
        .max_connections(1)
        .connect(url)
        .await?;
    didhub_migrations::sqlite_migrator().run(&pool).await?;
    let db = Db::from_any_pool(pool, didhub_db::models::DbBackend::Sqlite, url.to_string());

    let nu = NewUser {
        username: "testuser".to_string(),
        password_hash: "hash".to_string(),
        is_system: false,
        is_approved: true,
    };
    let user = db.create_user(nu).await?;
    // set about_me
    let mut f = UpdateUserFields::default();
    f.about_me = Some(Some("Hello world".to_string()));
    let updated = db.update_user(&user.id, f).await?;
    let u = updated.expect("user exists");
    assert_eq!(u.about_me.as_deref(), Some("Hello world"));

    // clear about_me
    let mut f2 = UpdateUserFields::default();
    f2.about_me = Some(None);
    let updated2 = db.update_user(&user.id, f2).await?;
    let u2 = updated2.expect("user exists");
    assert_eq!(u2.about_me, None);

    Ok(())
}
