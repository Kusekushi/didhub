/// Parsed command-line arguments.
pub struct CliArgs {
    /// Path to configuration file, if provided via `--config-path` or `-c`.
    pub config_path: Option<String>,
    /// Whether help was requested.
    pub help_requested: bool,
}

impl CliArgs {
    /// Parse command-line arguments.
    ///
    /// Supported flags:
    /// - `--config-path <path>` or `--config-path=<path>` or `-c <path>`: Path to config file
    /// - `--help` or `-h`: Print help and exit
    pub fn parse() -> Self {
        let args: Vec<String> = std::env::args().collect();

        let help_requested = args.iter().any(|a| a == "--help" || a == "-h");

        let config_path = Self::extract_config_path(&args);

        Self {
            config_path,
            help_requested,
        }
    }

    /// Print usage information to stderr.
    pub fn print_help() {
        eprintln!(
            "Usage: didhub-backend [--config-path PATH] [--help]\n\n\
             --config-path, -c    Path to configuration file (overrides DIDHUB_CONFIG_PATH env var)"
        );
    }

    fn extract_config_path(args: &[String]) -> Option<String> {
        let mut i = 1usize;
        while i < args.len() {
            let a = &args[i];
            if let Some(stripped) = a.strip_prefix("--config-path=") {
                return Some(stripped.to_string());
            } else if a == "--config-path" || a == "-c" {
                if i + 1 < args.len() {
                    return Some(args[i + 1].clone());
                }
                return None;
            } else if let Some(stripped) = a.strip_prefix("-c=") {
                return Some(stripped.to_string());
            }
            i += 1;
        }
        None
    }
}
