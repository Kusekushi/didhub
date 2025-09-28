use crate::models::{Db, DbBackend};
use crate::users::UserOperations;
use anyhow::{Context, Result};
use didhub_migrations::{mysql_migrator, postgres_migrator, sqlite_migrator};
use sqlx::any::AnyPoolOptions;
use std::path::{Path, PathBuf};
use tracing::{debug, info};

impl Db {
    pub async fn connect() -> Result<Self> {
        let raw_env = std::env::var("DIDHUB_DB").ok();
        let (db_url, is_sqlite) = match raw_env {
            Some(v) => {
                if v.starts_with("sqlite:") {
                    // If path after scheme is relative, make it absolute for reliability on Windows.
                    let prefix = if v.starts_with("sqlite:///") {
                        "sqlite:///"
                    } else if v.starts_with("sqlite://") {
                        "sqlite://"
                    } else {
                        "sqlite:"
                    };
                    let after = v.strip_prefix(prefix).unwrap();
                    let (path_part, query_opt) = after
                        .split_once('?')
                        .map(|(p, q)| (p, Some(q)))
                        .unwrap_or((after, None));
                    let mut pbuf = PathBuf::from(path_part);
                    if pbuf.is_relative() {
                        if let Ok(cwd) = std::env::current_dir() {
                            pbuf = cwd.join(pbuf);
                        }
                    }
                    let norm = pbuf.to_string_lossy().replace('\\', "/");
                    let rebuilt = if let Some(q) = query_opt {
                        if cfg!(windows) {
                            format!("sqlite:///{}?{}", norm, q)
                        } else {
                            format!("sqlite://{}?{}", norm, q)
                        }
                    } else {
                        if cfg!(windows) {
                            format!("sqlite:///{}", norm)
                        } else {
                            format!("sqlite://{}", norm)
                        }
                    };
                    (rebuilt, true)
                } else if v.ends_with(".db") || v.ends_with(".sqlite") {
                    let norm = v.replace('\\', "/");
                    // Make absolute
                    let mut pbuf = PathBuf::from(norm.clone());
                    if pbuf.is_relative() {
                        if let Ok(cwd) = std::env::current_dir() {
                            pbuf = cwd.join(pbuf);
                        }
                    }
                    let abs = pbuf.to_string_lossy().replace('\\', "/");
                    if cfg!(windows) {
                        (format!("sqlite:///{}", abs), true)
                    } else {
                        (format!("sqlite://{}", abs), true)
                    }
                } else {
                    // assume full URL for other adapters (future-proof)
                    let is_known = v.starts_with("postgres://") || v.starts_with("mysql://");
                    (v, is_known)
                }
            }
            None => {
                let mut p = PathBuf::from("data");
                if let Ok(cwd) = std::env::current_dir() {
                    p = cwd.join(p);
                }
                std::fs::create_dir_all(&p).ok();
                p.push("didhub.sqlite");
                let norm = p.to_string_lossy().replace('\\', "/");
                if cfg!(windows) {
                    (format!("sqlite:///{}", norm), true)
                } else {
                    (format!("sqlite://{}", norm), true)
                }
            }
        };

        if is_sqlite {
            let path_part = db_url.strip_prefix("sqlite://").unwrap_or("");
            // strip query params if present
            let file_only = path_part.split('?').next().unwrap_or(path_part);
            let fs_path = Path::new(file_only);
            if let Some(parent) = fs_path.parent() {
                std::fs::create_dir_all(parent).ok();
            }
            // Pre-create the file to avoid SQLite create race/permission issues
            if !fs_path.exists() {
                if let Some(parent) = fs_path.parent() {
                    let _ = std::fs::create_dir_all(parent);
                }
                let _ = std::fs::OpenOptions::new()
                    .create(true)
                    .write(true)
                    .open(fs_path);
            }
        }

        // Ensure the Any runtime has concrete drivers registered before connecting.
        sqlx::any::install_default_drivers();
        tracing::debug!(target="didhub_server", db_url=%db_url, "connecting to database");
        let pool = AnyPoolOptions::new()
            .max_connections(50)
            .min_connections(5)
            .connect(&db_url)
            .await
            .with_context(|| format!("failed to connect to database at {db_url}"))?;
        // Run migrations appropriate for detected backend
        if db_url.starts_with("sqlite:") || db_url.starts_with("sqlite://") {
            debug!("running SQLite migrations");
            sqlite_migrator()
                .run(&pool)
                .await
                .with_context(|| "failed running sqlite migrations".to_string())?;
            info!("SQLite migrations completed successfully");
        } else if db_url.starts_with("postgres://") || db_url.starts_with("postgresql://") {
            debug!("running PostgreSQL migrations");
            postgres_migrator()
                .run(&pool)
                .await
                .with_context(|| "failed running postgres migrations".to_string())?;
            info!("PostgreSQL migrations completed successfully");
        } else if db_url.starts_with("mysql://") {
            debug!("running MySQL migrations");
            mysql_migrator()
                .run(&pool)
                .await
                .with_context(|| "failed running mysql migrations".to_string())?;
            info!("MySQL migrations completed successfully");
        } else {
            debug!("running default SQLite migrations");
            sqlite_migrator()
                .run(&pool)
                .await
                .with_context(|| "failed running migrations".to_string())?;
            info!("default migrations completed successfully");
        }
        let backend = if db_url.starts_with("sqlite:") || db_url.starts_with("sqlite://") {
            DbBackend::Sqlite
        } else if db_url.starts_with("postgres://") || db_url.starts_with("postgresql://") {
            DbBackend::Postgres
        } else if db_url.starts_with("mysql://") {
            DbBackend::MySql
        } else {
            DbBackend::Sqlite
        };
        tracing::info!(target="didhub_server", db_url=%db_url, backend=?backend, "database initialized");
        Ok(Self {
            pool,
            backend,
            url: db_url,
        })
    }

    pub async fn connect_with_file(file_path: &str) -> Result<Self> {
        // Build absolute path
        let mut pbuf = PathBuf::from(file_path);
        if pbuf.is_relative() {
            if let Ok(cwd) = std::env::current_dir() {
                pbuf = cwd.join(pbuf);
            }
        }
        let abs = pbuf.to_string_lossy().replace('\\', "/");
        let db_url = format!("sqlite:///{}", abs);

        // ensure parent dir exists and pre-create file
        let fs_path = Path::new(&abs);
        if let Some(parent) = fs_path.parent() {
            std::fs::create_dir_all(parent).ok();
        }
        if !fs_path.exists() {
            if let Some(parent) = fs_path.parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            let _ = std::fs::OpenOptions::new()
                .create(true)
                .write(true)
                .open(fs_path);
        }

        // Ensure the Any runtime has concrete drivers registered before connecting.
        sqlx::any::install_default_drivers();
        tracing::debug!(target="didhub_server", db_url=%db_url, "connecting to database (file)");
        let pool = AnyPoolOptions::new()
            .max_connections(50)
            .min_connections(5)
            .connect(&db_url)
            .await
            .with_context(|| format!("failed to connect to database at {db_url}"))?;
        if db_url.starts_with("sqlite:") || db_url.starts_with("sqlite://") {
            sqlite_migrator()
                .run(&pool)
                .await
                .with_context(|| "failed running sqlite migrations".to_string())?;
        } else if db_url.starts_with("postgres://") || db_url.starts_with("postgresql://") {
            postgres_migrator()
                .run(&pool)
                .await
                .with_context(|| "failed running postgres migrations".to_string())?;
        } else if db_url.starts_with("mysql://") {
            mysql_migrator()
                .run(&pool)
                .await
                .with_context(|| "failed running mysql migrations".to_string())?;
        } else {
            sqlite_migrator()
                .run(&pool)
                .await
                .with_context(|| "failed running migrations".to_string())?;
        }
        let backend = if db_url.starts_with("sqlite:") || db_url.starts_with("sqlite://") {
            DbBackend::Sqlite
        } else if db_url.starts_with("postgres://") || db_url.starts_with("postgresql://") {
            DbBackend::Postgres
        } else if db_url.starts_with("mysql://") {
            DbBackend::MySql
        } else {
            DbBackend::Sqlite
        };
        tracing::info!(target="didhub_server", db_url=%db_url, backend=?backend, "database initialized");
        Ok(Self {
            pool,
            backend,
            url: db_url,
        })
    }

    /// Create bootstrap admin user if configured and doesn't already exist
    pub async fn ensure_bootstrap_admin(&self, cfg: &didhub_config::AppConfig) -> Result<()> {
        use crate::models::{NewUser, UpdateUserFields};
        use bcrypt::{hash, DEFAULT_COST};
        use tracing::info;

        match (&cfg.bootstrap_admin_username, &cfg.bootstrap_admin_password) {
            (Some(username), Some(password)) if !username.is_empty() && !password.is_empty() => {
                if self.fetch_user_by_username(username).await?.is_none() {
                    let password_hash =
                        hash(password, DEFAULT_COST).context("hashing bootstrap admin password")?;

                    let user = self
                        .create_user(NewUser {
                            username: username.clone(),
                            password_hash,
                            is_system: false,
                            is_approved: true,
                        })
                        .await?;

                    // Make the user an admin
                    self.update_user(
                        user.id,
                        UpdateUserFields {
                            is_admin: Some(true),
                            ..Default::default()
                        },
                    )
                    .await?;

                    info!(id = user.id, username = %username, "created bootstrap admin user");
                }
            }
            _ => {
                tracing::debug!("no bootstrap admin configured");
            }
        }
        Ok(())
    }
}
