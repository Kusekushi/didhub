use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use anyhow::{bail, Context, Result};

use crate::cli::ServiceManagerKind;
use crate::util::{binary_name, command_exists};

#[derive(Debug, Clone)]
pub struct ServiceInstall {
    pub service_name: String,
    pub install_root: PathBuf,
    pub config_path: PathBuf,
    pub env_path: Option<PathBuf>,
    pub working_directory: PathBuf,
}

pub fn detect_service_manager() -> Option<ServiceManagerKind> {
    if command_exists("systemctl") {
        Some(ServiceManagerKind::Systemd)
    } else if command_exists("rc-update") {
        Some(ServiceManagerKind::Openrc)
    } else if Path::new("/etc/sv").exists() || command_exists("sv") || command_exists("runsvdir") {
        Some(ServiceManagerKind::Runit)
    } else if command_exists("service") && command_exists("sysrc") {
        Some(ServiceManagerKind::RcD)
    } else {
        None
    }
}

pub fn install_service(kind: ServiceManagerKind, spec: &ServiceInstall) -> Result<PathBuf> {
    match kind {
        ServiceManagerKind::Systemd => install_systemd(spec),
        ServiceManagerKind::Openrc => install_openrc(spec),
        ServiceManagerKind::Runit => install_runit(spec),
        ServiceManagerKind::RcD => install_rcd(spec),
        ServiceManagerKind::Auto | ServiceManagerKind::None => {
            bail!("service installation requires a concrete service manager")
        }
    }
}

pub fn enable_service(
    kind: ServiceManagerKind,
    spec: &ServiceInstall,
    start_now: bool,
) -> Result<()> {
    match kind {
        ServiceManagerKind::Systemd => {
            run_status(
                Command::new(binary_name("systemctl")).arg("daemon-reload"),
                "reload systemd units",
            )?;
            run_status(
                Command::new(binary_name("systemctl"))
                    .arg("enable")
                    .arg(&spec.service_name),
                "enable systemd service",
            )?;
            if start_now {
                run_status(
                    Command::new(binary_name("systemctl"))
                        .arg("restart")
                        .arg(&spec.service_name),
                    "start systemd service",
                )?;
            }
        }
        ServiceManagerKind::Openrc => {
            run_status(
                Command::new(binary_name("rc-update"))
                    .arg("add")
                    .arg(&spec.service_name)
                    .arg("default"),
                "enable openrc service",
            )?;
            if start_now {
                run_status(
                    Command::new(binary_name("rc-service"))
                        .arg(&spec.service_name)
                        .arg("restart"),
                    "start openrc service",
                )?;
            }
        }
        ServiceManagerKind::Runit => {
            let live_dir = if Path::new("/var/service").exists() {
                PathBuf::from("/var/service")
            } else {
                PathBuf::from("/run/runit/service")
            };
            fs::create_dir_all(&live_dir)
                .with_context(|| format!("create {}", live_dir.display()))?;
            let enabled_path = live_dir.join(&spec.service_name);
            if !enabled_path.exists() {
                create_symlink(
                    &PathBuf::from("/etc/sv").join(&spec.service_name),
                    &enabled_path,
                )
                .with_context(|| format!("link {}", enabled_path.display()))?;
            }
            if start_now && command_exists("sv") {
                run_status(
                    Command::new(binary_name("sv"))
                        .arg("up")
                        .arg(&spec.service_name),
                    "start runit service",
                )?;
            }
        }
        ServiceManagerKind::RcD => {
            run_status(
                Command::new(binary_name("sysrc")).arg(format!("{}_enable=YES", spec.service_name)),
                "enable rc.d service",
            )?;
            if start_now {
                run_status(
                    Command::new(binary_name("service"))
                        .arg(&spec.service_name)
                        .arg("restart"),
                    "start rc.d service",
                )?;
            }
        }
        ServiceManagerKind::Auto | ServiceManagerKind::None => {}
    }
    Ok(())
}

fn install_systemd(spec: &ServiceInstall) -> Result<PathBuf> {
    let target = PathBuf::from(format!("/etc/systemd/system/{}.service", spec.service_name));
    write_text_file(&target, &render_systemd_unit(spec))?;
    Ok(target)
}

fn install_openrc(spec: &ServiceInstall) -> Result<PathBuf> {
    let target = PathBuf::from(format!("/etc/init.d/{}", spec.service_name));
    write_text_file(&target, &render_openrc_script(spec))?;
    make_executable(&target)?;
    Ok(target)
}

fn install_runit(spec: &ServiceInstall) -> Result<PathBuf> {
    let root = PathBuf::from("/etc/sv").join(&spec.service_name);
    fs::create_dir_all(&root).with_context(|| format!("create {}", root.display()))?;
    let run_path = root.join("run");
    write_text_file(&run_path, &render_runit_run(spec))?;
    make_executable(&run_path)?;
    Ok(run_path)
}

fn install_rcd(spec: &ServiceInstall) -> Result<PathBuf> {
    let target = PathBuf::from(format!("/usr/local/etc/rc.d/{}", spec.service_name));
    write_text_file(&target, &render_rcd_script(spec))?;
    make_executable(&target)?;
    Ok(target)
}

fn render_systemd_unit(spec: &ServiceInstall) -> String {
    let backend = spec
        .install_root
        .join("bin")
        .join(binary_name("didhub-backend"));
    let env_line = spec
        .env_path
        .as_ref()
        .map(|path| format!("EnvironmentFile=-{}\n", path.display()))
        .unwrap_or_default();
    format!(
        "[Unit]\nDescription=DIDHub Backend\nAfter=network-online.target\nWants=network-online.target\n\n[Service]\nType=simple\nWorkingDirectory={working_directory}\n{env_line}ExecStart={backend} --config-path {config}\nRestart=on-failure\nRestartSec=5\n\n[Install]\nWantedBy=multi-user.target\n",
        working_directory = spec.working_directory.display(),
        env_line = env_line,
        backend = backend.display(),
        config = spec.config_path.display()
    )
}

fn render_openrc_script(spec: &ServiceInstall) -> String {
    let backend = spec
        .install_root
        .join("bin")
        .join(binary_name("didhub-backend"));
    let env_source = spec
        .env_path
        .as_ref()
        .map(|path| {
            format!(
                "if [ -f \"{}\" ]; then . \"{}\"; fi\n",
                path.display(),
                path.display()
            )
        })
        .unwrap_or_default();
    format!(
        "#!/sbin/openrc-run\nname=\"DIDHub Backend\"\ncommand=\"{backend}\"\ncommand_args=\"--config-path {config}\"\ncommand_background=\"yes\"\npidfile=\"/run/{service}.pid\"\ndirectory=\"{workdir}\"\ndepend() {{\n    need net\n}}\nstart_pre() {{\n{env_source}}}\n",
        backend = backend.display(),
        config = spec.config_path.display(),
        service = spec.service_name,
        workdir = spec.working_directory.display(),
        env_source = indent_block(&env_source, "    ")
    )
}

fn render_runit_run(spec: &ServiceInstall) -> String {
    let backend = spec
        .install_root
        .join("bin")
        .join(binary_name("didhub-backend"));
    let env_source = spec
        .env_path
        .as_ref()
        .map(|path| {
            format!(
                "[ -f \"{}\" ] && . \"{}\"\n",
                path.display(),
                path.display()
            )
        })
        .unwrap_or_default();
    format!(
        "#!/bin/sh\nset -eu\ncd \"{workdir}\"\n{env_source}exec \"{backend}\" --config-path \"{config}\"\n",
        workdir = spec.working_directory.display(),
        env_source = env_source,
        backend = backend.display(),
        config = spec.config_path.display()
    )
}

fn render_rcd_script(spec: &ServiceInstall) -> String {
    let backend = spec
        .install_root
        .join("bin")
        .join(binary_name("didhub-backend"));
    let env_file = spec
        .env_path
        .as_ref()
        .map(|path| format!("export didhub_env_file=\"{}\"\n", path.display()))
        .unwrap_or_default();
    format!(
        "#!/bin/sh\n# PROVIDE: {service}\n# REQUIRE: NETWORKING\n# KEYWORD: shutdown\n\n. /etc/rc.subr\n\nname=\"{service}\"\nrcvar=\"{service}_enable\"\ncommand=\"{backend}\"\ncommand_args=\"--config-path {config}\"\npidfile=\"/var/run/{service}.pid\"\nstart_precmd=\"{service}_prestart\"\n\n{env_file}{service}_prestart() {{\n    [ -n \"${{didhub_env_file:-}}\" ] && [ -f \"$didhub_env_file\" ] && . \"$didhub_env_file\"\n}}\n\nload_rc_config $name\n: ${{{service}_enable:=NO}}\nrun_rc_command \"$1\"\n",
        service = spec.service_name,
        backend = backend.display(),
        config = spec.config_path.display(),
        env_file = env_file
    )
}

fn write_text_file(path: &Path, contents: &str) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).with_context(|| format!("create {}", parent.display()))?;
    }
    fs::write(path, contents).with_context(|| format!("write {}", path.display()))
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

fn indent_block(text: &str, prefix: &str) -> String {
    text.lines()
        .map(|line| format!("{prefix}{line}\n"))
        .collect::<String>()
}

#[cfg(unix)]
fn make_executable(path: &Path) -> Result<()> {
    use std::os::unix::fs::PermissionsExt;

    let mut permissions = fs::metadata(path)
        .with_context(|| format!("stat {}", path.display()))?
        .permissions();
    permissions.set_mode(0o755);
    fs::set_permissions(path, permissions).with_context(|| format!("chmod {}", path.display()))
}

#[cfg(not(unix))]
fn make_executable(_path: &Path) -> Result<()> {
    Ok(())
}

#[cfg(unix)]
fn create_symlink(src: &Path, dst: &Path) -> std::io::Result<()> {
    std::os::unix::fs::symlink(src, dst)
}

#[cfg(windows)]
fn create_symlink(src: &Path, dst: &Path) -> std::io::Result<()> {
    std::os::windows::fs::symlink_dir(src, dst)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_spec() -> ServiceInstall {
        ServiceInstall {
            service_name: "didhub-backend".to_string(),
            install_root: PathBuf::from("/opt/didhub"),
            config_path: PathBuf::from("/etc/didhub/config.yaml"),
            env_path: Some(PathBuf::from("/etc/didhub/admin.env")),
            working_directory: PathBuf::from("/opt/didhub"),
        }
    }

    #[test]
    fn systemd_unit_references_backend_and_env() {
        let unit = render_systemd_unit(&sample_spec());
        assert!(unit.contains("EnvironmentFile=-/etc/didhub/admin.env"));
        assert!(unit.contains("ExecStart="));
        assert!(unit.contains("didhub-backend"));
        assert!(unit.contains("--config-path /etc/didhub/config.yaml"));
    }

    #[test]
    fn runit_script_sources_env_file() {
        let script = render_runit_run(&sample_spec());
        assert!(script.contains("[ -f \"/etc/didhub/admin.env\" ] && . \"/etc/didhub/admin.env\""));
    }
}
