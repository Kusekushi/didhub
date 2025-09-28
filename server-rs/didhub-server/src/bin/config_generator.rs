use anyhow::Result;
use clap::Parser;
use inquire::{Confirm, Select, Text};
use serde_json::json;
use std::fs;

#[derive(Parser)]
#[command(name = "config-generator")]
#[command(about = "Interactive DIDHub configuration generator")]
struct Args {
    #[arg(short, long, help = "Output file path")]
    output: Option<String>,
}

#[tokio::main]
async fn main() -> Result<()> {
    let args = Args::parse();

    println!("DIDHub Configuration Generator");
    println!("==============================");

    // Database configuration
    println!("\nDatabase Configuration:");
    let db_driver = Select::new(
        "Select database driver:",
        vec!["sqlite", "postgres", "mysql"],
    )
    .prompt()?;

    let database_config = match db_driver {
        "sqlite" => {
            let path = Text::new("SQLite database path:")
                .with_default("./data/didhub.sqlite")
                .prompt()?;
            json!({
                "driver": "sqlite",
                "path": path
            })
        }
        "postgres" => {
            let host = Text::new("PostgreSQL host:")
                .with_default("localhost")
                .prompt()?;
            let port: u16 = Text::new("PostgreSQL port:")
                .with_default("5432")
                .prompt()?
                .parse()
                .unwrap_or(5432);
            let database = Text::new("Database name:")
                .with_default("didhub")
                .prompt()?;
            let username = Text::new("Username:")
                .with_default("didhub")
                .prompt()?;
            let password = Text::new("Password:")
                .prompt()?;
            let ssl_mode = Select::new(
                "SSL mode:",
                vec!["disable", "require", "verify-ca", "verify-full"],
            )
            .with_starting_cursor(0)
            .prompt()?;
            json!({
                "driver": "postgres",
                "host": host,
                "port": port,
                "database": database,
                "username": username,
                "password": password,
                "ssl_mode": ssl_mode
            })
        }
        "mysql" => {
            let host = Text::new("MySQL host:")
                .with_default("localhost")
                .prompt()?;
            let port: u16 = Text::new("MySQL port:")
                .with_default("3306")
                .prompt()?
                .parse()
                .unwrap_or(3306);
            let database = Text::new("Database name:")
                .with_default("didhub")
                .prompt()?;
            let username = Text::new("Username:")
                .with_default("didhub")
                .prompt()?;
            let password = Text::new("Password:")
                .prompt()?;
            json!({
                "driver": "mysql",
                "host": host,
                "port": port,
                "database": database,
                "username": username,
                "password": password
            })
        }
        _ => unreachable!(),
    };

    // Server configuration
    println!("\nServer Configuration:");
    let host = Text::new("Server host:")
        .with_default("0.0.0.0")
        .prompt()?;
    let port: u16 = Text::new("Server port:")
        .with_default("6000")
        .prompt()?
        .parse()
        .unwrap_or(6000);

    let server_config = json!({
        "host": host,
        "port": port
    });

    // Logging configuration
    println!("\nLogging Configuration:");
    let log_level = Select::new(
        "Log level:",
        vec!["error", "warn", "info", "debug", "trace"],
    )
    .with_starting_cursor(2)
    .prompt()?;
    let log_json = Confirm::new("Use JSON logging format?")
        .with_default(false)
        .prompt()?;

    let logging_config = json!({
        "level": log_level,
        "json": log_json
    });

    // CORS configuration
    println!("\nCORS Configuration:");
    let allow_all_origins = Confirm::new("Allow all frontend origins? (development only)")
        .with_default(false)
        .prompt()?;
    let allowed_origins = if !allow_all_origins {
        let origins_str = Text::new("Allowed frontend origins (comma-separated):")
            .with_default("http://localhost:5173,http://localhost:5174")
            .prompt()?;
        origins_str
            .split(',')
            .map(|s| s.trim().to_string())
            .collect::<Vec<_>>()
    } else {
        vec![]
    };

    let cors_config = json!({
        "allow_all_origins": allow_all_origins,
        "allowed_origins": allowed_origins
    });

    // Redis configuration
    println!("\nRedis Configuration:");
    let use_redis = Confirm::new("Use Redis for caching and sessions?")
        .with_default(false)
        .prompt()?;
    let redis_url = if use_redis {
        Text::new("Redis URL:")
            .with_default("redis://localhost:6379/0")
            .prompt()?
    } else {
        String::new()
    };

    // Upload configuration
    println!("\nUpload Configuration:");
    let upload_dir = Text::new("Upload directory:")
        .with_default("./uploads")
        .prompt()?;
    let max_file_size: u64 = Text::new("Max file size (bytes):")
        .with_default("10485760")
        .prompt()?
        .parse()
        .unwrap_or(10485760);
    let allowed_types = Text::new("Allowed MIME types (comma-separated):")
        .with_default("image/jpeg,image/png,image/gif")
        .prompt()?
        .split(',')
        .map(|s| s.trim().to_string())
        .collect::<Vec<_>>();

    let uploads_config = json!({
        "directory": upload_dir,
        "max_file_size": max_file_size,
        "allowed_types": allowed_types
    });

    // Auto-update configuration
    println!("\nAuto-Update Configuration:");
    let auto_update_enabled = Confirm::new("Enable auto-update functionality?")
        .with_default(false)
        .prompt()?;
    let auto_update_check = if auto_update_enabled {
        Confirm::new("Enable periodic update checks?")
            .with_default(false)
            .prompt()?
    } else {
        false
    };
    let update_repo = if auto_update_enabled {
        Text::new("Update repository (owner/repo):")
            .with_default("Kusekushi/didhub")
            .prompt()?
    } else {
        "Kusekushi/didhub".to_string()
    };
    let check_interval_hours: u64 = if auto_update_enabled && auto_update_check {
        Text::new("Update check interval (hours):")
            .with_default("24")
            .prompt()?
            .parse()
            .unwrap_or(24)
    } else {
        24
    };

    let auto_update_config = json!({
        "enabled": auto_update_enabled,
        "check_enabled": auto_update_check,
        "repo": update_repo,
        "check_interval_hours": check_interval_hours
    });

    // Build the final config
    let mut config = json!({
        "database": database_config,
        "server": server_config,
        "logging": logging_config,
        "cors": cors_config,
        "uploads": uploads_config,
        "auto_update": auto_update_config
    });

    if use_redis {
        config["redis"] = json!({
            "url": redis_url
        });
    }

    // Output
    let output_path = args.output.unwrap_or_else(|| "config.json".to_string());
    let config_str = serde_json::to_string_pretty(&config)?;

    fs::write(&output_path, &config_str)?;
    println!("\nConfiguration saved to: {}", output_path);
    println!("\nGenerated configuration:");
    println!("{}", config_str);

    Ok(())
}