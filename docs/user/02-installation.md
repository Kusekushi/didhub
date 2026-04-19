# DidHub: User Installation Guide

This guide explains how to install DIDHub from a GitHub release archive by running the bundled setup helper.

## Prerequisites

- A released DIDHub archive downloaded from GitHub Releases
- Administrative access on the machine where DIDHub will run
- One of the supported target platforms:
  - Linux with `systemd`, `openrc`, or `runit`
  - FreeBSD-style systems with `rc.d`
  - Windows for manual/non-service setup
- For PostgreSQL or MySQL installs, local or reachable database admin credentials

## Installation from a release archive

1. Download and extract the release archive.
2. Open a terminal in the extracted directory.
3. Run the setup helper:

```bash
# Linux / macOS / BSD
./didhub-setup
```

```powershell
# Windows PowerShell
.\didhub-setup.exe
```

The default flow launches an interactive wizard. It configures SQLite unless you choose another database, creates `config/config.yaml`, prepares the data directories, runs database migrations, and installs a service when a supported service manager is available.

## Common installation variants

### PostgreSQL

```bash
./didhub-setup install \
  --non-interactive \
  --database-driver postgres \
  --database-host 127.0.0.1 \
  --database-port 5432 \
  --database-name didhub \
  --database-user didhub \
  --database-password change-me \
  --db-admin-user postgres \
  --db-admin-password postgres-admin-password \
  --admin-username admin \
  --admin-password change-me
```

### MySQL

```bash
./didhub-setup install \
  --non-interactive \
  --database-driver mysql \
  --database-host 127.0.0.1 \
  --database-port 3306 \
  --database-name didhub \
  --database-user didhub \
  --database-password change-me \
  --db-admin-user root \
  --db-admin-password mysql-root-password \
  --admin-username admin \
  --admin-password change-me
```

### Disable service or firewall automation

```bash
./didhub-setup install \
  --non-interactive \
  --service-manager none \
  --skip-firewall \
  --admin-username admin \
  --admin-password change-me
```

## What the setup helper creates

- `config/config.yaml` — generated DIDHub configuration
- `config/admin.env` — optional admin bootstrap environment file
- `data/` — data directory, including SQLite DB when that driver is used
- `logs/` — default log directory
- service definitions under the chosen init system

## Post-install operation

If the helper installed and enabled a service manager entry, DIDHub should already be running or ready to start through that service manager.

If you installed without service automation, start the backend manually from the extracted directory:

```bash
./bin/didhub-backend --config-path ./config/config.yaml
```

Then open the DIDHub UI in your browser at `http://<host>:<port>`. The default port is `6000`.

## Troubleshooting

- If service installation fails, rerun with `--service-manager none` and start `bin/didhub-backend` manually first.
- If firewall automation fails, rerun with `--skip-firewall` and open the port yourself.
- If PostgreSQL or MySQL setup fails, verify the admin credentials and that `psql` or `mysql` is installed on the host.
- If authentication is not configured explicitly, the setup helper generates a `jwt_secret` automatically. You can override that with `--jwt-secret` or `--jwt-pem-path`.
- If you prefer scripted installation, use `didhub-setup install --non-interactive ...`.
