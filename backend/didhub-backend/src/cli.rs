use clap::Parser;

/// DIDHub Backend
#[derive(Parser, Debug)]
#[command(author, version, about, long_about = None)]
pub struct CliArgs {
    /// Path to configuration file.
    /// Overrides DIDHUB_CONFIG_PATH env var.
    #[arg(short, long, name = "PATH")]
    pub config_path: Option<String>,

    /// Override the log filter.
    /// Examples: 'info', 'debug,sqlx=warn', 'didhub_backend=trace'.
    #[arg(short = 'L', long, name = "FILTER")]
    pub log_level: Option<String>,
}

impl CliArgs {
    /// Parse command-line arguments.
    pub fn parse() -> Self {
        Parser::parse()
    }
}
