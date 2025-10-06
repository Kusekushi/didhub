use anyhow::Result;
use bcrypt::{hash, DEFAULT_COST};
use didhub_config::AppConfig;
use didhub_db::{users::UserOperations, Db, NewUser, UpdateUserFields};
use tracing::info;

#[tokio::main]
async fn main() -> Result<()> {
    let _ = dotenvy::dotenv();
    // Allow --config flag same as main
    {
        let mut args = std::env::args().skip(1);
        while let Some(arg) = args.next() {
            if arg == "--config" || arg == "-c" {
                if let Some(path) = args.next() {
                    if std::env::var("DIDHUB_DB_CONFIG").is_err() {
                        std::env::set_var("DIDHUB_DB_CONFIG", &path);
                    }
                }
            }
        }
    }
    let cfg = AppConfig::from_env()?;
    didhub_server::logging::init(cfg.log_json);
    sqlx::any::install_default_drivers();
    let db = Db::connect().await?;

    let mut created = 0;
    // Basic seeds: admin (if not existing), demo user
    if let Some((admin_user, admin_pass)) = default_admin_pair(&cfg) {
        if db.fetch_user_by_username(&admin_user).await?.is_none() {
            let ph = hash(&admin_pass, DEFAULT_COST)?;
            let u = db
                .create_user(NewUser {
                    username: admin_user.clone(),
                    password_hash: ph,
                    is_system: false,
                    is_approved: true,
                })
                .await?;
            // Grant admin privileges to the bootstrap admin user
            db.update_user(u.id, didhub_db::UpdateUserFields {
                is_admin: Some(true),
                ..Default::default()
            }).await?;
            info!(id = u.id, user=%admin_user, "seeded admin user with admin privileges");
            created += 1;
        }
    }
    if db.fetch_user_by_username("demo").await?.is_none() {
        let ph = hash("demo1234", DEFAULT_COST)?;
        let u = db
            .create_user(NewUser {
                username: "demo".into(),
                password_hash: ph,
                is_system: false,
                is_approved: true,
            })
            .await?;
        info!(id = u.id, user = "demo", "seeded demo user");
        created += 1;
    }

    info!(created, "seed complete");
    Ok(())
}

fn default_admin_pair(cfg: &AppConfig) -> Option<(String, String)> {
    match (&cfg.bootstrap_admin_username, &cfg.bootstrap_admin_password) {
        (Some(u), Some(p)) if !u.is_empty() && !p.is_empty() => Some((u.clone(), p.clone())),
        _ => None,
    }
}
