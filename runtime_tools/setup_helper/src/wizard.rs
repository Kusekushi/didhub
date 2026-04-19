use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::str::FromStr;

use anyhow::{bail, Context, Result};

use crate::cli::{DatabaseDriver, FirewallManagerKind, InstallArgs, ServiceManagerKind};
use crate::{firewall, install, service};

pub fn run(args: &mut InstallArgs) -> Result<()> {
    let detected_root = install::resolve_install_root(args.install_root.as_deref())?;
    println!("DIDHub setup wizard");
    println!("Press Enter to accept the default shown in brackets.");
    println!();

    args.install_root = Some(prompt_path(
        "Install root",
        args.install_root.as_ref().unwrap_or(&detected_root),
    )?);

    let default_config_path = args.config_path.clone().unwrap_or_else(|| {
        args.install_root
            .as_ref()
            .expect("install root")
            .join("config")
            .join("config.yaml")
    });
    args.config_path = Some(prompt_path("Config path", &default_config_path)?);

    args.service_name = prompt_string("Service name", &args.service_name)?;
    args.host = prompt_string("Bind host", &args.host)?;
    args.port = prompt_parse("Port", args.port)?;

    args.allow_all_origins = prompt_bool("Allow all CORS origins", args.allow_all_origins)?;
    if args.allow_all_origins {
        args.cors_origin.clear();
    } else {
        let default_origins = if args.cors_origin.is_empty() {
            String::new()
        } else {
            args.cors_origin.join(",")
        };
        let origins = prompt_string("Allowed CORS origins (comma-separated)", &default_origins)?;
        args.cors_origin = split_csv(&origins);
    }

    args.log_level = prompt_string("Log level", &args.log_level)?;
    args.log_json = prompt_bool("Use JSON logs", args.log_json)?;

    let default_log_dir = args.log_dir.clone().unwrap_or_else(|| {
        args.install_root
            .as_ref()
            .expect("install root")
            .join("logs")
    });
    args.log_dir = Some(prompt_path("Log directory", &default_log_dir)?);

    let default_uploads_dir = args.uploads_dir.clone().unwrap_or_else(|| {
        args.install_root
            .as_ref()
            .expect("install root")
            .join("data")
            .join("uploads")
    });
    args.uploads_dir = Some(prompt_path("Uploads directory", &default_uploads_dir)?);

    args.database_driver = prompt_database_driver(args.database_driver)?;
    match args.database_driver {
        DatabaseDriver::Sqlite => {
            let default_db_path = args.database_path.clone().unwrap_or_else(|| {
                args.install_root
                    .as_ref()
                    .expect("install root")
                    .join("data")
                    .join("didhub.sqlite")
            });
            args.database_path = Some(prompt_path("SQLite database path", &default_db_path)?);
            args.database_host = None;
            args.database_port = None;
            args.database_name = None;
            args.database_user = None;
            args.database_password = None;
            args.database_ssl_mode = None;
            args.db_admin_user = None;
            args.db_admin_password = None;
            args.db_admin_database = None;
        }
        DatabaseDriver::Postgres | DatabaseDriver::Mysql => {
            let default_host = args
                .database_host
                .clone()
                .unwrap_or_else(|| "127.0.0.1".to_string());
            let default_port = args.database_port.unwrap_or(match args.database_driver {
                DatabaseDriver::Postgres => 5432,
                DatabaseDriver::Mysql => 3306,
                DatabaseDriver::Sqlite => unreachable!(),
            });
            let default_admin_db =
                args.db_admin_database
                    .clone()
                    .unwrap_or_else(|| match args.database_driver {
                        DatabaseDriver::Postgres => "postgres".to_string(),
                        DatabaseDriver::Mysql => "mysql".to_string(),
                        DatabaseDriver::Sqlite => unreachable!(),
                    });
            args.database_path = None;
            args.database_host = Some(prompt_string("Database host", &default_host)?);
            args.database_port = Some(prompt_parse("Database port", default_port)?);
            args.database_name = Some(prompt_required_string(
                "Database name",
                args.database_name.as_deref().unwrap_or("didhub"),
            )?);
            args.database_user = Some(prompt_required_string(
                "Database user",
                args.database_user.as_deref().unwrap_or("didhub"),
            )?);
            args.database_password = Some(prompt_required_string(
                "Database password",
                args.database_password.as_deref().unwrap_or(""),
            )?);
            args.database_ssl_mode = prompt_optional_string(
                "Database ssl_mode (blank for none)",
                args.database_ssl_mode.as_deref(),
            )?;
            args.db_admin_user = Some(prompt_required_string(
                "Database admin user",
                args.db_admin_user
                    .as_deref()
                    .unwrap_or(match args.database_driver {
                        DatabaseDriver::Postgres => "postgres",
                        DatabaseDriver::Mysql => "root",
                        DatabaseDriver::Sqlite => unreachable!(),
                    }),
            )?);
            args.db_admin_password = Some(prompt_required_string(
                "Database admin password",
                args.db_admin_password.as_deref().unwrap_or(""),
            )?);
            args.db_admin_database = Some(prompt_required_string(
                "Database admin database",
                &default_admin_db,
            )?);
        }
    }

    let detected_service_manager =
        service::detect_service_manager().unwrap_or(ServiceManagerKind::None);
    args.service_manager = prompt_service_manager(args.service_manager, detected_service_manager)?;
    if args.service_manager == ServiceManagerKind::None {
        args.skip_service_enable = true;
        args.skip_service_start = true;
    } else {
        args.skip_service_enable =
            !prompt_bool("Enable service after install", !args.skip_service_enable)?;
        args.skip_service_start = if args.skip_service_enable {
            true
        } else {
            !prompt_bool("Start service now", !args.skip_service_start)?
        };
    }

    let detected_firewall_manager =
        firewall::detect_firewall_manager().unwrap_or(FirewallManagerKind::None);
    let use_firewall = prompt_bool("Configure firewall automatically", !args.skip_firewall)?;
    if use_firewall {
        args.skip_firewall = false;
        args.firewall_manager =
            prompt_firewall_manager(args.firewall_manager, detected_firewall_manager)?;
        if args.firewall_manager == FirewallManagerKind::None {
            args.skip_firewall = true;
        }
    } else {
        args.skip_firewall = true;
        args.firewall_manager = FirewallManagerKind::None;
    }

    let auth_default = if args.jwt_pem_path.is_some() {
        "pem"
    } else if args.jwt_secret.is_some() {
        "secret"
    } else {
        "generated"
    };
    match prompt_choice(
        "Authentication mode [generated|secret|pem]",
        auth_default,
        &["generated", "secret", "pem"],
    )?
    .as_str()
    {
        "generated" => {
            args.jwt_secret = None;
            args.jwt_pem_path = None;
        }
        "secret" => {
            args.jwt_secret = Some(prompt_required_string(
                "JWT secret",
                args.jwt_secret.as_deref().unwrap_or(""),
            )?);
            args.jwt_pem_path = None;
        }
        "pem" => {
            let pem_path = prompt_required_string(
                "JWT PEM path",
                args.jwt_pem_path
                    .as_ref()
                    .and_then(|path| path.to_str())
                    .unwrap_or(""),
            )?;
            args.jwt_pem_path = Some(PathBuf::from(pem_path));
            args.jwt_secret = None;
        }
        _ => unreachable!(),
    }

    args.auto_update_enabled = prompt_bool("Enable auto-update", args.auto_update_enabled)?;
    args.auto_update_check_enabled = if args.auto_update_enabled {
        prompt_bool(
            "Enable scheduled update checks",
            args.auto_update_check_enabled,
        )?
    } else {
        false
    };
    args.auto_update_repo = if args.auto_update_enabled || args.auto_update_check_enabled {
        prompt_optional_string(
            "Auto-update repository URL (blank for none)",
            args.auto_update_repo.as_deref(),
        )?
    } else {
        None
    };

    let provision_admin = prompt_bool(
        "Provision an initial admin user",
        args.admin_username.is_some() || args.admin_password.is_some(),
    )?;
    if provision_admin {
        args.admin_username = Some(prompt_required_string(
            "Admin username",
            args.admin_username.as_deref().unwrap_or("admin"),
        )?);
        args.admin_password = Some(prompt_required_string(
            "Admin password",
            args.admin_password.as_deref().unwrap_or(""),
        )?);
        args.admin_display_name = prompt_optional_string(
            "Admin display name (blank for none)",
            args.admin_display_name.as_deref(),
        )?;
    } else {
        args.admin_username = None;
        args.admin_password = None;
        args.admin_display_name = None;
    }

    println!();
    println!("Configuration summary:");
    println!(
        "  root={} db={} service={} firewall={}",
        args.install_root.as_ref().expect("install root").display(),
        args.database_driver.as_str(),
        args.service_manager.as_str(),
        args.firewall_manager.as_str()
    );
    if !prompt_bool("Continue with installation", true)? {
        bail!("setup cancelled");
    }

    Ok(())
}

fn prompt_string(label: &str, default: &str) -> Result<String> {
    let input = prompt(label, Some(default))?;
    Ok(if input.is_empty() {
        default.to_string()
    } else {
        input
    })
}

fn prompt_required_string(label: &str, default: &str) -> Result<String> {
    loop {
        let value = prompt_string(label, default)?;
        if !value.trim().is_empty() {
            return Ok(value);
        }
        println!("Value is required.");
    }
}

fn prompt_optional_string(label: &str, default: Option<&str>) -> Result<Option<String>> {
    let input = prompt(label, default)?;
    Ok(if input.trim().is_empty() {
        default.and_then(|value| {
            if value.is_empty() {
                None
            } else {
                Some(value.to_string())
            }
        })
    } else {
        Some(input)
    })
}

fn prompt_bool(label: &str, default: bool) -> Result<bool> {
    loop {
        let default_text = if default { "Y/n" } else { "y/N" };
        let input = prompt(&format!("{label} {default_text}"), None)?;
        let value = input.trim();
        if value.is_empty() {
            return Ok(default);
        }
        match value.to_ascii_lowercase().as_str() {
            "y" | "yes" | "true" | "1" => return Ok(true),
            "n" | "no" | "false" | "0" => return Ok(false),
            _ => println!("Please answer yes or no."),
        }
    }
}

fn prompt_parse<T>(label: &str, default: T) -> Result<T>
where
    T: FromStr + std::fmt::Display + Copy,
{
    loop {
        let input = prompt(label, Some(&default.to_string()))?;
        if input.trim().is_empty() {
            return Ok(default);
        }
        match input.parse::<T>() {
            Ok(value) => return Ok(value),
            Err(_) => println!("Invalid value."),
        }
    }
}

fn prompt_path(label: &str, default: &Path) -> Result<PathBuf> {
    Ok(PathBuf::from(prompt_string(
        label,
        &default.display().to_string(),
    )?))
}

fn prompt_database_driver(default: DatabaseDriver) -> Result<DatabaseDriver> {
    let value = prompt_choice(
        "Database driver [sqlite|postgres|mysql]",
        default.as_str(),
        &["sqlite", "postgres", "mysql"],
    )?;
    match value.as_str() {
        "sqlite" => Ok(DatabaseDriver::Sqlite),
        "postgres" => Ok(DatabaseDriver::Postgres),
        "mysql" => Ok(DatabaseDriver::Mysql),
        _ => unreachable!(),
    }
}

fn prompt_service_manager(
    current: ServiceManagerKind,
    detected: ServiceManagerKind,
) -> Result<ServiceManagerKind> {
    let default = if current == ServiceManagerKind::Auto {
        detected.as_str()
    } else {
        current.as_str()
    };
    let value = prompt_choice(
        "Service manager [none|systemd|openrc|runit|rc-d]",
        default,
        &["none", "systemd", "openrc", "runit", "rc-d"],
    )?;
    match value.as_str() {
        "none" => Ok(ServiceManagerKind::None),
        "systemd" => Ok(ServiceManagerKind::Systemd),
        "openrc" => Ok(ServiceManagerKind::Openrc),
        "runit" => Ok(ServiceManagerKind::Runit),
        "rc-d" => Ok(ServiceManagerKind::RcD),
        _ => unreachable!(),
    }
}

fn prompt_firewall_manager(
    current: FirewallManagerKind,
    detected: FirewallManagerKind,
) -> Result<FirewallManagerKind> {
    let default = if current == FirewallManagerKind::Auto {
        detected.as_str()
    } else {
        current.as_str()
    };
    let value = prompt_choice(
        "Firewall manager [none|ufw|firewalld|iptables|pf]",
        default,
        &["none", "ufw", "firewalld", "iptables", "pf"],
    )?;
    match value.as_str() {
        "none" => Ok(FirewallManagerKind::None),
        "ufw" => Ok(FirewallManagerKind::Ufw),
        "firewalld" => Ok(FirewallManagerKind::Firewalld),
        "iptables" => Ok(FirewallManagerKind::Iptables),
        "pf" => Ok(FirewallManagerKind::Pf),
        _ => unreachable!(),
    }
}

fn prompt_choice(label: &str, default: &str, choices: &[&str]) -> Result<String> {
    loop {
        let value = prompt(label, Some(default))?;
        let selected = if value.trim().is_empty() {
            default.to_string()
        } else {
            value
        };
        if choices
            .iter()
            .any(|choice| selected.eq_ignore_ascii_case(choice))
        {
            return Ok(selected.to_ascii_lowercase());
        }
        println!("Choose one of: {}", choices.join(", "));
    }
}

fn prompt(label: &str, default: Option<&str>) -> Result<String> {
    let mut stdout = io::stdout();
    match default {
        Some(default) if !default.is_empty() => write!(stdout, "{label} [{default}]: ")?,
        _ => write!(stdout, "{label}: ")?,
    }
    stdout.flush().context("flush stdout")?;

    let mut input = String::new();
    io::stdin()
        .read_line(&mut input)
        .context("read wizard input")?;
    Ok(input.trim().to_string())
}

fn split_csv(value: &str) -> Vec<String> {
    value
        .split(',')
        .map(str::trim)
        .filter(|item| !item.is_empty())
        .map(ToOwned::to_owned)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn split_csv_discards_empty_entries() {
        assert_eq!(
            split_csv("https://a.example, ,https://b.example"),
            vec![
                "https://a.example".to_string(),
                "https://b.example".to_string()
            ]
        );
    }
}
