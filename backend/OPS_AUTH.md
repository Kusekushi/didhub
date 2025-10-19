Authentication ops notes

This file documents how to configure JWT authentication for the didhub backend and how to verify which key is loaded via startup logs.

Environment variables

- JWT_PEM (preferred): PEM-encoded RSA public key string for RS256 verification. Example: 
  - Set the full PEM into the environment value (be careful with quoting/newlines when using systemd or k8s secrets).
- JWT_PEM_PATH: Path to a file containing the PEM-encoded RSA public key. The server will read and parse the file at startup.
- JWT_SECRET: Shared secret used for HS256 verification (not recommended for public-key deployments).

Precedence

1. JWT_PEM (inline) — highest precedence
2. JWT_PEM_PATH
3. JWT_SECRET

Startup fingerprint

On startup the server computes a non-sensitive fingerprint for the loaded key material and logs it with the message:

  "authentication configured" with fields `auth_mode` and `key_fingerprint`.

- For RS256 the fingerprint is computed as `SHA256(DER(public-key))` and the first 12 hex characters are shown.
- For HS256 the fingerprint is `SHA256(secret)` and the first 12 hex characters are shown.

This fingerprint is non-sensitive and can be used to confirm which key material the running service is using. Example log line:

  INFO authentication configured auth_mode=RS256(path=/etc/keys/didhub.pub) key_fingerprint=3f2a9b4c8d12

How to check

- Systemd journal:

```powershell
# on the server
journalctl -u didhub.service -n 200 | Select-String "authentication configured"
```

- Kubernetes (container logs):

```bash
kubectl logs deployment/didhub-backend | grep "authentication configured"
```

- If you need to verify the fingerprint corresponds to a given file:
  - For RS256: compute the SHA256 of the DER bytes inside the PEM. Example using OpenSSL and sha256sum:

```bash
# extract DER from PEM and compute SHA256
openssl pkey -pubin -in /path/to/pub.pem -outform DER | sha256sum | cut -c1-12
```

- For HS256: compute SHA256 of the secret value and compare first 12 hex chars.

Security notes

- Never log the actual secret or PEM contents.
- Use Kubernetes Secrets or a secure vault to provide JWT_PEM / JWT_SECRET to your environment.
- Rotate keys by updating the secret and restarting the service.

Admin provisioning

- See `ADMIN_PROVISIONING.md` for documentation on provisioning an initial admin user via environment variables (DIDHUB_ADMIN_*). This describes the env var contract, behavior, and security recommendations.
