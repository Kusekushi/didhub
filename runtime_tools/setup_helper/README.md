# DIDHub Setup Helper

`didhub-setup` is the release-archive installer for DIDHub. It configures a downloaded release in place: writes a production config, prepares the database, installs a service, and optionally opens the firewall port.

## What it does

- creates `config/config.yaml`
- provisions SQLite, PostgreSQL, or MySQL and runs migrations
- writes admin bootstrap env vars to `config/admin.env` when requested
- installs service definitions for `systemd`, `openrc`, `runit`, or `rc.d`
- opens the configured TCP port through `ufw`, `firewalld`, `iptables`, or `pf`

## Typical usage

Extract a release archive, `cd` into the extracted directory, then run:

```bash
# Launch the interactive wizard (default)
./didhub-setup
```

```bash
# Same wizard, explicitly
./didhub-setup install
```

```bash
# Non-interactive PostgreSQL install
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
  --service-manager systemd \
  --firewall-manager ufw \
  --admin-username admin \
  --admin-password change-me
```

On Windows, run `.\didhub-setup.exe`. Service and firewall integration are primarily for Unix-like hosts; unsupported managers fail explicitly instead of silently skipping.

## Important flags

- `--non-interactive`: skip the wizard and use only CLI flags/defaults
- `--install-root <path>`: install/configure another extracted archive location
- `--config-path <path>`: write the generated config somewhere else
- `--service-manager <auto|none|systemd|openrc|runit|rc-d>`
- `--firewall-manager <auto|none|ufw|firewalld|iptables|pf>`
- `--skip-service-enable`, `--skip-service-start`, `--skip-firewall`
- `--jwt-secret` or `--jwt-pem-path` to control auth bootstrap

If no JWT setting is supplied, the helper generates a `jwt_secret` automatically.
