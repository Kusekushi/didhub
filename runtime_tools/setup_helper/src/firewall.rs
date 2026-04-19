use std::fs;
use std::path::PathBuf;
use std::process::Command;

use anyhow::{bail, Context, Result};

use crate::cli::FirewallManagerKind;
use crate::util::{binary_name, command_exists};

pub fn detect_firewall_manager() -> Option<FirewallManagerKind> {
    if command_exists("ufw") {
        Some(FirewallManagerKind::Ufw)
    } else if command_exists("firewall-cmd") {
        Some(FirewallManagerKind::Firewalld)
    } else if command_exists("pfctl") {
        Some(FirewallManagerKind::Pf)
    } else if command_exists("iptables") {
        Some(FirewallManagerKind::Iptables)
    } else {
        None
    }
}

pub fn open_tcp_port(kind: FirewallManagerKind, service_name: &str, port: u16) -> Result<()> {
    match kind {
        FirewallManagerKind::Ufw => run_status(
            Command::new(binary_name("ufw"))
                .arg("allow")
                .arg(format!("{port}/tcp")),
            "open ufw port",
        ),
        FirewallManagerKind::Firewalld => {
            run_status(
                Command::new(binary_name("firewall-cmd"))
                    .arg("--permanent")
                    .arg(format!("--add-port={port}/tcp")),
                "open firewalld port",
            )?;
            run_status(
                Command::new(binary_name("firewall-cmd")).arg("--reload"),
                "reload firewalld",
            )
        }
        FirewallManagerKind::Iptables => {
            let check_status = Command::new(binary_name("iptables"))
                .arg("-C")
                .arg("INPUT")
                .arg("-p")
                .arg("tcp")
                .arg("--dport")
                .arg(port.to_string())
                .arg("-j")
                .arg("ACCEPT")
                .status()
                .context("check iptables rule")?;
            if check_status.success() {
                return Ok(());
            }
            run_status(
                Command::new(binary_name("iptables"))
                    .arg("-A")
                    .arg("INPUT")
                    .arg("-p")
                    .arg("tcp")
                    .arg("--dport")
                    .arg(port.to_string())
                    .arg("-j")
                    .arg("ACCEPT"),
                "add iptables rule",
            )
        }
        FirewallManagerKind::Pf => {
            let anchor_path = PathBuf::from(format!("/etc/pf.anchors/{service_name}"));
            if let Some(parent) = anchor_path.parent() {
                fs::create_dir_all(parent)
                    .with_context(|| format!("create {}", parent.display()))?;
            }
            fs::write(
                &anchor_path,
                format!("pass in proto tcp to any port {port}\n"),
            )
            .with_context(|| format!("write {}", anchor_path.display()))?;

            let pf_conf = PathBuf::from("/etc/pf.conf");
            let mut contents = fs::read_to_string(&pf_conf)
                .with_context(|| format!("read {}", pf_conf.display()))?;
            let anchor_decl = format!("anchor \"{service_name}\"");
            let load_decl = format!(
                "load anchor \"{service_name}\" from \"{}\"",
                anchor_path.display()
            );
            if !contents.contains(&anchor_decl) {
                contents.push('\n');
                contents.push_str(&anchor_decl);
                contents.push('\n');
            }
            if !contents.contains(&load_decl) {
                contents.push_str(&load_decl);
                contents.push('\n');
            }
            fs::write(&pf_conf, contents)
                .with_context(|| format!("write {}", pf_conf.display()))?;
            run_status(
                Command::new(binary_name("pfctl"))
                    .arg("-f")
                    .arg("/etc/pf.conf"),
                "reload pf rules",
            )?;
            run_status(Command::new(binary_name("pfctl")).arg("-e"), "enable pf")
        }
        FirewallManagerKind::Auto | FirewallManagerKind::None => {
            bail!("firewall manager must be explicit before opening a port")
        }
    }
}

fn run_status(command: &mut Command, description: &str) -> Result<()> {
    let status = command
        .status()
        .with_context(|| format!("failed to {description}"))?;
    if !status.success() {
        bail!("{description} exited with status {status}");
    }
    Ok(())
}
