use std::fs;
use std::path::{Path, PathBuf};

use anyhow::{bail, Context, Result};
use uuid::Uuid;

use crate::cli::{FirewallManagerKind, InstallArgs, ServiceManagerKind};
use crate::{db, firewall, service};
use crate::util::binary_name;

pub async fn run_install(mut args: InstallArgs) -> Result<()> {
    if !args.non_interactive {
        crate::wizard::run(&mut args)?;
    }
    run_install_inner(args).await
}

async fn run_install_inner(args: InstallArgs) -> Result<()> {
    let install_root = resolve_install_root(args.install_root.as_deref())?;
    ensure_backend_layout(&install_root)?;

    let config_path = args
        .config_path
        .clone()
        .unwrap_or_else(|| install_root.join("config").join("config.yaml"));
    let data_dir = install_root.join("data");
    let uploads_dir = args
        .uploads_dir
        .clone()
        .unwrap_or_else(|| data_dir.join("uploads"));
    let log_dir = args
        .log_dir
        .clone()
        .unwrap_or_else(|| install_root.join("logs"));

    fs::create_dir_all(&data_dir).with_context(|| format!("create {}", data_dir.display()))?;
    fs::create_dir_all(&uploads_dir)
        .with_context(|| format!("create {}", uploads_dir.display()))?;
    fs::create_dir_all(&log_dir).with_context(|| format!("create {}", log_dir.display()))?;
    if let Some(parent) = config_path.parent() {
        fs::create_dir_all(parent).with_context(|| format!("create {}", parent.display()))?;
    }

    let prepared_db = db::prepare(&args, &data_dir)?;
    db::provision_and_migrate(&prepared_db).await?;

    let config = build_config(&args, &prepared_db, &uploads_dir, &log_dir)?;
    didhub_config::validate_config(&config).context("validate generated config")?;
    let yaml = serde_yaml::to_string(&config).context("serialize config")?;
    fs::write(&config_path, yaml).with_context(|| format!("write {}", config_path.display()))?;

    let admin_env_path = write_admin_env(&install_root, &args)?;

    let effective_service_manager = match args.service_manager {
        ServiceManagerKind::Auto => {
            service::detect_service_manager().unwrap_or(ServiceManagerKind::None)
        }
        other => other,
    };
    if effective_service_manager != ServiceManagerKind::None {
        let spec = service::ServiceInstall {
            service_name: args.service_name.clone(),
            install_root: install_root.clone(),
            config_path: config_path.clone(),
            env_path: admin_env_path.clone(),
            working_directory: install_root.clone(),
        };
        let installed_path = service::install_service(effective_service_manager, &spec)?;
        if !args.skip_service_enable {
            service::enable_service(effective_service_manager, &spec, !args.skip_service_start)?;
        }
        eprintln!(
            "Installed service definition at {}",
            installed_path.display()
        );
    }

    if !args.skip_firewall {
        let effective_firewall_manager = match args.firewall_manager {
            FirewallManagerKind::Auto => {
                firewall::detect_firewall_manager().unwrap_or(FirewallManagerKind::None)
            }
            other => other,
        };
        if effective_firewall_manager != FirewallManagerKind::None {
            firewall::open_tcp_port(effective_firewall_manager, &args.service_name, args.port)?;
        }
    }

    eprintln!("DIDHub configured at {}", install_root.display());
    eprintln!("Config written to {}", config_path.display());
    if let Some(env_path) = admin_env_path {
        eprintln!("Admin provisioning env written to {}", env_path.display());
    }
    Ok(())
}

fn build_config(
    args: &InstallArgs,
    prepared_db: &db::PreparedDatabase,
    uploads_dir: &Path,
    log_dir: &Path,
) -> Result<didhub_config::Config> {
    let mut config = didhub_config::Config::default();
    config.server.host = args.host.clone();
    config.server.port = args.port;
    config.logging.level = args.log_level.clone();
    config.logging.json = args.log_json;
    config.logging.log_dir = Some(log_dir.display().to_string());
    config.cors.allowed_origins = args.cors_origin.clone();
    config.cors.allow_all_origins = args.allow_all_origins;
    config.uploads.directory = uploads_dir.display().to_string();
    config.auto_update.enabled = args.auto_update_enabled;
    config.auto_update.check_enabled = args.auto_update_check_enabled;
    config.auto_update.repo = args.auto_update_repo.clone();
    config.auth.jwt_pem_path = args
        .jwt_pem_path
        .as_ref()
        .map(|path| path.display().to_string());
    config.auth.jwt_secret = match (&args.jwt_secret, &args.jwt_pem_path) {
        (Some(secret), _) => Some(secret.clone()),
        (None, Some(_)) => None,
        (None, None) => Some(format!("didhub-{}", Uuid::new_v4())),
    };

    config.database.driver = args.database_driver.as_str().to_string();
    config.database.path = Some(db::config_path_value(prepared_db));

    match prepared_db {
        db::PreparedDatabase::Sqlite { .. } => {
            config.database.host = None;
            config.database.port = None;
            config.database.database = None;
            config.database.username = None;
            config.database.password = None;
            config.database.ssl_mode = None;
        }
        db::PreparedDatabase::External {
            host,
            port,
            database,
            username,
            password,
            ..
        } => {
            config.database.host = Some(host.clone());
            config.database.port = Some(*port);
            config.database.database = Some(database.clone());
            config.database.username = Some(username.clone());
            config.database.password = Some(password.clone());
            config.database.ssl_mode = args.database_ssl_mode.clone();
        }
    }

    Ok(config)
}

fn write_admin_env(install_root: &Path, args: &InstallArgs) -> Result<Option<PathBuf>> {
    match (&args.admin_username, &args.admin_password) {
        (None, None) => Ok(None),
        (Some(_), None) | (None, Some(_)) => {
            bail!("--admin-username and --admin-password must be provided together")
        }
        (Some(username), Some(password)) => {
            let env_path = install_root.join("config").join("admin.env");
            let mut content = format!(
                "DIDHUB_ADMIN_USERNAME={}\nDIDHUB_ADMIN_PASSWORD={}\n",
                shell_escape(username),
                shell_escape(password)
            );
            if let Some(display_name) = &args.admin_display_name {
                content.push_str(&format!(
                    "DIDHUB_ADMIN_DISPLAY_NAME={}\n",
                    shell_escape(display_name)
                ));
            }
            fs::write(&env_path, content)
                .with_context(|| format!("write {}", env_path.display()))?;
            Ok(Some(env_path))
        }
    }
}

fn ensure_backend_layout(install_root: &Path) -> Result<()> {
    let backend = install_root.join("bin").join(binary_name("didhub-backend"));
    if !backend.exists() {
        bail!(
            "expected backend binary at {}. Run this setup tool from an extracted release archive or pass --install-root",
            backend.display()
        );
    }
    Ok(())
}

pub fn resolve_install_root(explicit: Option<&Path>) -> Result<PathBuf> {
    if let Some(path) = explicit {
        return Ok(path.to_path_buf());
    }
    let exe = std::env::current_exe().context("locate setup executable")?;
    exe.parent()
        .map(Path::to_path_buf)
        .ok_or_else(|| anyhow::anyhow!("failed to derive install root from executable path"))
}

fn shell_escape(value: &str) -> String {
    let escaped = value.replace('\\', "\\\\").replace('"', "\\\"");
    format!("\"{escaped}\"")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generates_secret_when_no_auth_is_supplied() {
        let args = InstallArgs {
            service_manager: ServiceManagerKind::None,
            firewall_manager: FirewallManagerKind::None,
            skip_service_enable: true,
            skip_service_start: true,
            skip_firewall: true,
            ..InstallArgs::default()
        };
        let prepared = db::PreparedDatabase::Sqlite {
            path: PathBuf::from("/tmp/didhub.sqlite"),
        };
        let config = build_config(
            &args,
            &prepared,
            Path::new("/tmp/uploads"),
            Path::new("/tmp/logs"),
        )
        .expect("config");
        assert!(config.auth.jwt_secret.is_some());
    }

    #[test]
    fn resolve_install_root_uses_explicit_path() {
        let path = Path::new("/tmp/didhub");
        let resolved = resolve_install_root(Some(path)).expect("resolve");
        assert_eq!(resolved, PathBuf::from("/tmp/didhub"));
    }
}
