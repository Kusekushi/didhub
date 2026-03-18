# Prerequisites for developing on DIDAlterHub

This document lists the tools and versions required to set up a development environment for the DIDAlterHub project, along with OS-specific installation notes, verification commands, and environment guidance.

## Required tools and minimum versions
- Rust: latest stable (installed via rustup)
- Node.js: 18.x or newer
- Python: 3.10 or newer
- PNPM: latest stable
- PostgreSQL: 12+ recommended; 14+ preferred for newer features

### Verification commands (example)
- Rust: `rustc --version` and `cargo --version`
- Node.js: `node -v` and `npm -v` (or `corepack -h`)
- Python: `python3 --version` (or `python --version` on some systems) and `pip --version`
- PNPM: `pnpm -v`
- PostgreSQL: `psql --version` and `pg_dump --version`

## Optional tools
- Zig (runtime_tools): recommended if you intend to work with runtime_tools; verify with `zig version` or `zig -v`.
- Docker: useful for containerized tooling and local services; verify with `docker --version` and `docker-compose --version`.

## OS-specific installation notes
### Linux
- Use distro package managers or official installers. Consider:
  - Rust: install via rustup from https://rustup.rs
  - Node.js: NodeSource binaries or nvm
  - Python: system package or pyenv for multiple versions
  - PNPM: install via npm or corepack
  - PostgreSQL: your distro's PostgreSQL package; ensure the service is running
  - Zig: official binaries from ziglang.org or a package manager if available
  - Docker: install docker.io or the official Docker CE packages

### macOS
- Common choices:
  - Rust: rustup
  - Node.js: Homebrew: `brew install node@18` (or install Node.js from nodejs.org)
  - Python: Homebrew: `brew install python@3.10` or use pyenv
  - PNPM: `corepack enable` or `pnpm -v` after installation
  - PostgreSQL: Homebrew: `brew install postgresql` and start the service
  - Zig: Homebrew: `brew install zig`
  - Docker: Docker Desktop for Mac

### Windows
- Common choices:
  - Rust: rustup executable from https://rustup.rs/
  - Node.js: Windows installer from nodejs.org or nvm-windows
  - Python: Windows installer from python.org
  - PNPM: install via `npm i -g pnpm` after Node.js installation
  - PostgreSQL: PostgreSQL installer for Windows
  - Zig: official Windows binaries
  - Docker: Docker Desktop for Windows

> Note: There are multiple valid installation pathways for each tool. Choose the approach you prefer (official installers, version managers, or package managers) as long as the resulting tooling versions meet the minimums above.

## Environment setup tips
- PATH guidance:
  - Rust: ensure `~/.cargo/bin` is on your PATH so `cargo` and `rustc` are available.
  - Node.js and PNPM: Node's bin directory should be on PATH; PNPM adds its shims automatically after install.
  - Python: ensure the python3 and pip3 executables are on PATH; consider using a virtual environment for projects.
  - PostgreSQL: ensure the `psql` client is on PATH or use the full path to the binary.
  - Zig and Docker: their binaries should be discoverable via PATH as installed.
- Virtual environments: prefer Python virtual environments (venv) when developing Python tools that interact with the codebase.
- Common pitfalls:
  - Conflicting Python installations (2.x vs 3.x) on PATH
  - Node version mismatch with frontend tooling
  - Docker daemon not running when using containerized workflows
  - Database server not running when migrations run

## Quick verification checklist
- Run the verification commands listed above to confirm tool availability and versions.
- Ensure a PostgreSQL server is up if you plan to run migrations or local services.
- Confirm the Python environment can run `build.py` as the orchestrator works through Python.

## Notes
- This project uses Python as the orchestration layer via `build.py`. Ensure Python 3.10+ is available before starting development.
- If you rely on environment managers (rustup, nvm, pyenv, etc.), keep them up to date to avoid toolchain conflicts.
