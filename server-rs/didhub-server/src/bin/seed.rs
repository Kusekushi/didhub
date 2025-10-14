use anyhow::Result;
use argon2::password_hash::{rand_core::OsRng, SaltString};
use argon2::{Argon2, PasswordHasher};
use didhub_config::AppConfig;
use didhub_db::{users::UserOperations, alters::AlterOperations, relationships::AlterRelationships, Db, NewUser};
use tracing::info;
use serde_json::json;

#[tokio::main]
async fn main() -> Result<()> {
    let _ = dotenvy::dotenv();
    // Allow --config flag same as main and add --skip-alters/--no-alters to opt-out of alter seeding
    let mut skip_alters = false;
    {
        let mut args = std::env::args().skip(1);
        while let Some(arg) = args.next() {
            if arg == "--config" || arg == "-c" {
                if let Some(path) = args.next() {
                    if std::env::var("DIDHUB_DB_CONFIG").is_err() {
                        std::env::set_var("DIDHUB_DB_CONFIG", &path);
                    }
                }
            } else if arg == "--skip-alters" || arg == "--no-alters" {
                skip_alters = true;
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
            let salt = SaltString::generate(&mut OsRng);
            let argon2 = Argon2::default();
            let ph = argon2
                .hash_password(admin_pass.as_bytes(), &salt)
                .map_err(|e| anyhow::anyhow!("password hashing failed: {}", e))?
                .to_string();
            let u = db
                .create_user(NewUser {
                    username: admin_user.clone(),
                    password_hash: ph,
                    is_system: false,
                    is_approved: true,
                })
                .await?;
            // Grant admin privileges to the bootstrap admin user
            db.update_user(
                &u.id,
                didhub_db::UpdateUserFields {
                    is_admin: Some(true),
                    ..Default::default()
                },
            )
            .await?;
            info!(id = u.id, user=%admin_user, "seeded admin user with admin privileges");
            created += 1;
        }
    }
    if db.fetch_user_by_username("demo").await?.is_none() {
        let salt = SaltString::generate(&mut OsRng);
        let argon2 = Argon2::default();
        let ph = argon2
            .hash_password(b"demo1234", &salt)
            .map_err(|e| anyhow::anyhow!("password hashing failed: {}", e))?
            .to_string();
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

    // Create some example alters and relationships for demo/testing unless explicitly skipped
    // If the demo user exists (we just created it if needed), make a few alters owned by them
    if !skip_alters {
        if let Some(demo_user) = db.fetch_user_by_username("demo").await? {
        // Create alters Alice, Bob, and Carol owned by demo
        let alice = db
            .create_alter(&json!({"name": "Alice", "owner_user_id": demo_user.id.clone()}))
            .await?;
        info!(id = alice.id, name = %alice.name, "seeded alter Alice");

        let bob = db
            .create_alter(&json!({"name": "Bob", "owner_user_id": demo_user.id.clone()}))
            .await?;
        info!(id = bob.id, name = %bob.name, "seeded alter Bob");

        let carol = db
            .create_alter(&json!({"name": "Carol", "owner_user_id": demo_user.id.clone()}))
            .await?;
        info!(id = carol.id, name = %carol.name, "seeded alter Carol");

        // Wire relationships: Alice has Bob as a parent, and Alice partners with Carol
        let parents = vec![bob.id.clone()];
        let _ = db.replace_parents(&alice.id, &parents).await?;
        info!(child = %alice.id, parents = ?parents, "seeded parent relationship");

        let partners = vec![carol.id.clone()];
        let _ = db.replace_partners(&alice.id, &partners).await?;
        info!(alter = %alice.id, partners = ?partners, "seeded partner relationship");

            created += 4; // three owned + one ownerless
        }
    } else {
        info!("skipping alter seeding due to --skip-alters flag");
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
