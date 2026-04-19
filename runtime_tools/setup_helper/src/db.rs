use std::path::{Path, PathBuf};
use std::process::Command;
use std::str::FromStr;

use anyhow::{bail, Context, Result};
use sqlx::{mysql::MySqlPoolOptions, postgres::PgPoolOptions, sqlite::SqlitePoolOptions};
use url::Url;

use crate::cli::{DatabaseDriver, InstallArgs};
use crate::util::binary_name;

pub enum PreparedDatabase {
    Sqlite {
        path: PathBuf,
    },
    External {
        driver: DatabaseDriver,
        dsn: String,
        admin_user: String,
        admin_password: String,
        admin_database: String,
        host: String,
        port: u16,
        database: String,
        username: String,
        password: String,
    },
}

pub fn prepare(args: &InstallArgs, data_dir: &Path) -> Result<PreparedDatabase> {
    match args.database_driver {
        DatabaseDriver::Sqlite => {
            let path = args
                .database_path
                .clone()
                .unwrap_or_else(|| data_dir.join("didhub.sqlite"));
            Ok(PreparedDatabase::Sqlite { path })
        }
        DatabaseDriver::Postgres | DatabaseDriver::Mysql => {
            let host = required_string(args.database_host.clone(), "--database-host")?;
            let port = args.database_port.unwrap_or(match args.database_driver {
                DatabaseDriver::Postgres => 5432,
                DatabaseDriver::Mysql => 3306,
                DatabaseDriver::Sqlite => unreachable!(),
            });
            let database = required_string(args.database_name.clone(), "--database-name")?;
            let username = required_string(args.database_user.clone(), "--database-user")?;
            let password = required_string(args.database_password.clone(), "--database-password")?;
            let admin_user = required_string(args.db_admin_user.clone(), "--db-admin-user")?;
            let admin_password =
                required_string(args.db_admin_password.clone(), "--db-admin-password")?;
            let admin_database =
                args.db_admin_database
                    .clone()
                    .unwrap_or_else(|| match args.database_driver {
                        DatabaseDriver::Postgres => "postgres".to_string(),
                        DatabaseDriver::Mysql => "mysql".to_string(),
                        DatabaseDriver::Sqlite => unreachable!(),
                    });

            let dsn = build_dsn(
                args.database_driver,
                &username,
                &password,
                &host,
                port,
                &database,
                args.database_ssl_mode.as_deref(),
            )?;

            Ok(PreparedDatabase::External {
                driver: args.database_driver,
                dsn,
                admin_user,
                admin_password,
                admin_database,
                host,
                port,
                database,
                username,
                password,
            })
        }
    }
}

pub async fn provision_and_migrate(db: &PreparedDatabase) -> Result<()> {
    match db {
        PreparedDatabase::Sqlite { path } => {
            if let Some(parent) = path.parent() {
                std::fs::create_dir_all(parent)
                    .with_context(|| format!("create {}", parent.display()))?;
            }
            let options = sqlx::sqlite::SqliteConnectOptions::from_str("sqlite::memory:")?
                .filename(path)
                .create_if_missing(true);
            let pool = SqlitePoolOptions::new()
                .connect_with(options)
                .await
                .context("connect sqlite database")?;
            didhub_migrations::sqlite_migrator()
                .run(&pool)
                .await
                .context("run sqlite database migrations")
        }
        PreparedDatabase::External {
            driver,
            dsn,
            admin_user,
            admin_password,
            admin_database,
            host,
            port,
            database,
            username,
            password,
        } => match driver {
            DatabaseDriver::Postgres => {
                provision_postgres(
                    host,
                    *port,
                    admin_user,
                    admin_password,
                    admin_database,
                    database,
                    username,
                    password,
                )?;
                let pool = PgPoolOptions::new()
                    .connect(dsn)
                    .await
                    .context("connect postgres database")?;
                didhub_migrations::postgres_migrator()
                    .run(&pool)
                    .await
                    .context("run postgres database migrations")
            }
            DatabaseDriver::Mysql => {
                provision_mysql(
                    host,
                    *port,
                    admin_user,
                    admin_password,
                    database,
                    username,
                    password,
                )?;
                let pool = MySqlPoolOptions::new()
                    .connect(dsn)
                    .await
                    .context("connect mysql database")?;
                didhub_migrations::mysql_migrator()
                    .run(&pool)
                    .await
                    .context("run mysql database migrations")
            }
            DatabaseDriver::Sqlite => unreachable!(),
        },
    }
}

pub fn config_path_value(db: &PreparedDatabase) -> String {
    match db {
        PreparedDatabase::Sqlite { path } => path.display().to_string(),
        PreparedDatabase::External { dsn, .. } => dsn.clone(),
    }
}

#[allow(clippy::too_many_arguments)]
fn provision_postgres(
    host: &str,
    port: u16,
    admin_user: &str,
    admin_password: &str,
    admin_database: &str,
    database: &str,
    username: &str,
    password: &str,
) -> Result<()> {
    let role_query = format!(
        "DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '{user_lit}') THEN CREATE ROLE {user_ident} LOGIN PASSWORD '{password_lit}'; ELSE ALTER ROLE {user_ident} WITH LOGIN PASSWORD '{password_lit}'; END IF; END $$;",
        user_lit = escape_pg_literal(username),
        user_ident = quote_pg_identifier(username),
        password_lit = escape_pg_literal(password)
    );
    run_postgres_psql(
        host,
        port,
        admin_user,
        admin_password,
        admin_database,
        &["-c", &role_query],
    )?;

    let exists = run_postgres_capture(
        host,
        port,
        admin_user,
        admin_password,
        admin_database,
        &[
            "-tAc",
            &format!(
                "SELECT 1 FROM pg_database WHERE datname = '{}'",
                escape_pg_literal(database)
            ),
        ],
    )?;
    if exists.trim() != "1" {
        let create_db = format!(
            "CREATE DATABASE {} OWNER {};",
            quote_pg_identifier(database),
            quote_pg_identifier(username)
        );
        run_postgres_psql(
            host,
            port,
            admin_user,
            admin_password,
            admin_database,
            &["-c", &create_db],
        )?;
    }
    Ok(())
}

fn provision_mysql(
    host: &str,
    port: u16,
    admin_user: &str,
    admin_password: &str,
    database: &str,
    username: &str,
    password: &str,
) -> Result<()> {
    let sql = format!(
        "CREATE DATABASE IF NOT EXISTS {db}; CREATE USER IF NOT EXISTS {user}@'%' IDENTIFIED BY '{password}'; ALTER USER {user}@'%' IDENTIFIED BY '{password}'; GRANT ALL PRIVILEGES ON {db}.* TO {user}@'%'; FLUSH PRIVILEGES;",
        db = quote_mysql_identifier(database),
        user = quote_mysql_identifier(username),
        password = escape_mysql_literal(password),
    );
    let mut command = Command::new(binary_name("mysql"));
    command
        .arg("-h")
        .arg(host)
        .arg("-P")
        .arg(port.to_string())
        .arg("-u")
        .arg(admin_user)
        .env("MYSQL_PWD", admin_password)
        .arg("-e")
        .arg(sql);
    run_status(&mut command, "provision mysql database")
}

fn build_dsn(
    driver: DatabaseDriver,
    username: &str,
    password: &str,
    host: &str,
    port: u16,
    database: &str,
    ssl_mode: Option<&str>,
) -> Result<String> {
    let scheme = match driver {
        DatabaseDriver::Sqlite => bail!("sqlite DSNs are not built through URL"),
        DatabaseDriver::Postgres => "postgres",
        DatabaseDriver::Mysql => "mysql",
    };
    let mut url =
        Url::parse(&format!("{scheme}://placeholder")).context("construct database URL")?;
    url.set_username(username)
        .map_err(|_| anyhow::anyhow!("invalid database username"))?;
    url.set_password(Some(password))
        .map_err(|_| anyhow::anyhow!("invalid database password"))?;
    url.set_host(Some(host))
        .map_err(|_| anyhow::anyhow!("invalid database host"))?;
    url.set_port(Some(port))
        .map_err(|_| anyhow::anyhow!("invalid database port"))?;
    url.set_path(database);
    if let (DatabaseDriver::Postgres, Some(mode)) = (driver, ssl_mode) {
        url.query_pairs_mut().append_pair("sslmode", mode);
    }
    Ok(url.into())
}

fn run_postgres_psql(
    host: &str,
    port: u16,
    admin_user: &str,
    admin_password: &str,
    admin_database: &str,
    extra_args: &[&str],
) -> Result<()> {
    let mut command = postgres_base_command(host, port, admin_user, admin_password, admin_database);
    command.args(extra_args);
    run_status(&mut command, "provision postgres database")
}

fn run_postgres_capture(
    host: &str,
    port: u16,
    admin_user: &str,
    admin_password: &str,
    admin_database: &str,
    extra_args: &[&str],
) -> Result<String> {
    let mut command = postgres_base_command(host, port, admin_user, admin_password, admin_database);
    command.args(extra_args);
    let output = command.output().context("run psql")?;
    if !output.status.success() {
        bail!(
            "psql exited with status {}: {}",
            output.status,
            String::from_utf8_lossy(&output.stderr)
        );
    }
    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
}

fn postgres_base_command(
    host: &str,
    port: u16,
    admin_user: &str,
    admin_password: &str,
    admin_database: &str,
) -> Command {
    let mut command = Command::new(binary_name("psql"));
    command
        .env("PGPASSWORD", admin_password)
        .arg("-h")
        .arg(host)
        .arg("-p")
        .arg(port.to_string())
        .arg("-U")
        .arg(admin_user)
        .arg("-d")
        .arg(admin_database)
        .arg("-v")
        .arg("ON_ERROR_STOP=1");
    command
}

fn run_status(command: &mut Command, description: &str) -> Result<()> {
    let status = command
        .status()
        .with_context(|| format!("failed to {description}"))?;
    if !status.success() {
        bail!("{description} exited with status {status}");
    }
    Ok(())
}

fn required_string(value: Option<String>, flag: &str) -> Result<String> {
    value.ok_or_else(|| anyhow::anyhow!("{flag} is required for this database driver"))
}

fn quote_pg_identifier(value: &str) -> String {
    format!("\"{}\"", value.replace('"', "\"\""))
}

fn quote_mysql_identifier(value: &str) -> String {
    format!("`{}`", value.replace('`', "``"))
}

fn escape_pg_literal(value: &str) -> String {
    value.replace('\'', "''")
}

fn escape_mysql_literal(value: &str) -> String {
    value.replace('\\', "\\\\").replace('\'', "\\'")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_postgres_dsn() {
        let dsn = build_dsn(
            DatabaseDriver::Postgres,
            "user",
            "pass",
            "db.example",
            5432,
            "didhub",
            Some("require"),
        )
        .expect("dsn");
        assert!(dsn.starts_with("postgres://user:pass@db.example:5432/didhub"));
        assert!(dsn.contains("sslmode=require"));
    }

    #[test]
    fn config_path_for_sqlite_is_plain_file() {
        let db = PreparedDatabase::Sqlite {
            path: PathBuf::from("/var/lib/didhub/didhub.sqlite"),
        };
        assert_eq!(config_path_value(&db), "/var/lib/didhub/didhub.sqlite");
    }
}
