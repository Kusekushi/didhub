mod cli;
mod db;
mod firewall;
mod install;
mod service;
mod util;
mod wizard;

use clap::Parser;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let cli = cli::Cli::parse();
    match cli
        .command
        .unwrap_or(cli::Commands::Install(cli::InstallArgs::default()))
    {
        cli::Commands::Install(args) => install::run_install(args).await,
    }
}
