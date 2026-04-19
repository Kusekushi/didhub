use std::path::PathBuf;

use clap::{ArgAction, Args, Parser, Subcommand, ValueEnum};

#[derive(Parser, Debug)]
#[command(
    name = "didhub-setup",
    version,
    about = "Install and configure DIDHub from a release archive"
)]
pub struct Cli {
    #[command(subcommand)]
    pub command: Option<Commands>,
}

#[derive(Subcommand, Debug)]
pub enum Commands {
    Install(InstallArgs),
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, ValueEnum)]
pub enum DatabaseDriver {
    Sqlite,
    Postgres,
    Mysql,
}

impl DatabaseDriver {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Sqlite => "sqlite",
            Self::Postgres => "postgres",
            Self::Mysql => "mysql",
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, ValueEnum)]
pub enum ServiceManagerKind {
    Auto,
    None,
    Systemd,
    Openrc,
    Runit,
    #[value(name = "rc-d", alias = "rc.d", alias = "rcd")]
    RcD,
}

impl ServiceManagerKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Auto => "auto",
            Self::None => "none",
            Self::Systemd => "systemd",
            Self::Openrc => "openrc",
            Self::Runit => "runit",
            Self::RcD => "rc-d",
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, ValueEnum)]
pub enum FirewallManagerKind {
    Auto,
    None,
    Ufw,
    Firewalld,
    Iptables,
    Pf,
}

impl FirewallManagerKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Auto => "auto",
            Self::None => "none",
            Self::Ufw => "ufw",
            Self::Firewalld => "firewalld",
            Self::Iptables => "iptables",
            Self::Pf => "pf",
        }
    }
}

#[derive(Args, Debug, Clone)]
pub struct InstallArgs {
    #[arg(long, action = ArgAction::SetTrue)]
    pub non_interactive: bool,

    #[arg(long)]
    pub install_root: Option<PathBuf>,

    #[arg(long)]
    pub config_path: Option<PathBuf>,

    #[arg(long, default_value = "didhub-backend")]
    pub service_name: String,

    #[arg(long, value_enum, default_value_t = ServiceManagerKind::Auto)]
    pub service_manager: ServiceManagerKind,

    #[arg(long, value_enum, default_value_t = FirewallManagerKind::Auto)]
    pub firewall_manager: FirewallManagerKind,

    #[arg(long, action = ArgAction::SetTrue)]
    pub skip_service_enable: bool,

    #[arg(long, action = ArgAction::SetTrue)]
    pub skip_service_start: bool,

    #[arg(long, action = ArgAction::SetTrue)]
    pub skip_firewall: bool,

    #[arg(long, default_value = "0.0.0.0")]
    pub host: String,

    #[arg(long, default_value_t = 6000)]
    pub port: u16,

    #[arg(long, action = ArgAction::Append)]
    pub cors_origin: Vec<String>,

    #[arg(long, default_value_t = false)]
    pub allow_all_origins: bool,

    #[arg(long, default_value = "info")]
    pub log_level: String,

    #[arg(long, default_value_t = true)]
    pub log_json: bool,

    #[arg(long)]
    pub log_dir: Option<PathBuf>,

    #[arg(long)]
    pub uploads_dir: Option<PathBuf>,

    #[arg(long, default_value_t = false)]
    pub auto_update_enabled: bool,

    #[arg(long, default_value_t = false)]
    pub auto_update_check_enabled: bool,

    #[arg(long)]
    pub auto_update_repo: Option<String>,

    #[arg(long)]
    pub jwt_secret: Option<String>,

    #[arg(long)]
    pub jwt_pem_path: Option<PathBuf>,

    #[arg(long, value_enum, default_value_t = DatabaseDriver::Sqlite)]
    pub database_driver: DatabaseDriver,

    #[arg(long)]
    pub database_path: Option<PathBuf>,

    #[arg(long)]
    pub database_host: Option<String>,

    #[arg(long)]
    pub database_port: Option<u16>,

    #[arg(long)]
    pub database_name: Option<String>,

    #[arg(long)]
    pub database_user: Option<String>,

    #[arg(long)]
    pub database_password: Option<String>,

    #[arg(long)]
    pub database_ssl_mode: Option<String>,

    #[arg(long)]
    pub db_admin_user: Option<String>,

    #[arg(long)]
    pub db_admin_password: Option<String>,

    #[arg(long)]
    pub db_admin_database: Option<String>,

    #[arg(long)]
    pub admin_username: Option<String>,

    #[arg(long)]
    pub admin_password: Option<String>,

    #[arg(long)]
    pub admin_display_name: Option<String>,
}

impl InstallArgs {
    pub fn validate(&self) -> anyhow::Result<()> {
        if !self
            .service_name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
        {
            anyhow::bail!(
                "--service-name must contain only ASCII alphanumeric characters, '-' or '_'"
            );
        }
        Ok(())
    }
}

impl Default for InstallArgs {
    fn default() -> Self {
        Self {
            non_interactive: false,
            install_root: None,
            config_path: None,
            service_name: "didhub-backend".to_string(),
            service_manager: ServiceManagerKind::Auto,
            firewall_manager: FirewallManagerKind::Auto,
            skip_service_enable: false,
            skip_service_start: false,
            skip_firewall: false,
            host: "0.0.0.0".to_string(),
            port: 6000,
            cors_origin: Vec::new(),
            allow_all_origins: false,
            log_level: "info".to_string(),
            log_json: true,
            log_dir: None,
            uploads_dir: None,
            auto_update_enabled: false,
            auto_update_check_enabled: false,
            auto_update_repo: None,
            jwt_secret: None,
            jwt_pem_path: None,
            database_driver: DatabaseDriver::Sqlite,
            database_path: None,
            database_host: None,
            database_port: None,
            database_name: None,
            database_user: None,
            database_password: None,
            database_ssl_mode: None,
            db_admin_user: None,
            db_admin_password: None,
            db_admin_database: None,
            admin_username: None,
            admin_password: None,
            admin_display_name: None,
        }
    }
}

#[cfg(test)]
mod tests {
    use clap::Parser;

    use super::*;

    #[test]
    fn bare_cli_parses_without_subcommand() {
        let cli = Cli::parse_from(["didhub-setup"]);
        assert!(cli.command.is_none());
    }

    #[test]
    fn install_accepts_non_interactive_flag() {
        let cli = Cli::parse_from(["didhub-setup", "install", "--non-interactive"]);
        match cli.command {
            Some(Commands::Install(args)) => assert!(args.non_interactive),
            _ => panic!("expected install command"),
        }
    }

    #[test]
    fn validate_rejects_unsafe_service_name() {
        let args = InstallArgs {
            service_name: "bad;name".to_string(),
            ..InstallArgs::default()
        };

        assert!(args.validate().is_err());
    }
}
