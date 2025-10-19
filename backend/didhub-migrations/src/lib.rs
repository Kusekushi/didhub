use sqlx::migrate::Migrator;

pub static SQLITE_MIGRATOR: Migrator = sqlx_macros::migrate!("src/migrations_sqlite");
pub static POSTGRES_MIGRATOR: Migrator = sqlx_macros::migrate!("src/migrations_postgres");
pub static MYSQL_MIGRATOR: Migrator = sqlx_macros::migrate!("src/migrations_mysql");

pub fn sqlite_migrator() -> &'static Migrator {
    &SQLITE_MIGRATOR
}

pub fn postgres_migrator() -> &'static Migrator {
    &POSTGRES_MIGRATOR
}

pub fn mysql_migrator() -> &'static Migrator {
    &MYSQL_MIGRATOR
}
