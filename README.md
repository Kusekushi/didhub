# DIDAlterHub

DIDAlterHub is an open-source platform for managing Dissociative Identity Disorder (DID) related data and workflows.

## Tech Stack

- **Backend**: Rust (Axum) with multiple crates under `backend/`
- **Frontend**: React + TypeScript in `frontend/app/`
- **Build & Tooling**: Python scripts in `build_tools/` for codegen, builds, and release
- **Runtime Tools**: Zig-based utilities in `runtime_tools/`
- **Schemas**: Source of truth for API and DB in `schemas/`

## Quick Start (Developer)

### 1. Clone the Repository

```bash
git clone https://github.com/Kusekushi/didhub.git
cd didhub
```

### 2. Set Up Development Environment

**Prerequisites:**
- Rust (latest stable)
- Node.js (v18+)
- Python 3.10+
- pnpm
- PostgreSQL

### 3. Initialize the Project

```bash
# Create and activate Python virtual environment
python -m venv .venv

# Activate virtual environment (Linux/macOS)
source .venv/bin/activate

# Activate virtual environment (Windows PowerShell)
.\.venv\Scripts\Activate.ps1

# Install build tool dependencies
pip install -r build_tools/requirements.txt

# Install frontend dependencies
cd frontend/app && pnpm install && cd ../..
```

### 4. Run Development Servers

```bash
# Start both backend and frontend with hot-reload
python build.py dev

# Or start individual services
python build.py dev --rust    # Backend only
python build.py dev --web     # Frontend only
```

### 5. Run Tests

```bash
# Run all tests
python build.py test

# Run specific test suites
python build.py test --backend   # Backend tests only
python build.py test --frontend  # Frontend tests only
```

### 6. Build for Production

```bash
# Full build (includes code generation)
python build.py build

# Production build
python build.py build --release
```

### 7. Lint and Format

```bash
# Check code style
python build.py lint

# Auto-fix issues
python build.py lint --fix
```

## CLI Options

The build system forwards commands to specialized tools:

```bash
# Clean build artifacts
python build.py clean
python build.py clean --generated  # Reset generated code

# Code generation
python build.py codegen

# Generate docs and coverage
python build.py docs

# Create release
python build.py release
```

### Direct Backend Commands (Advanced)

For direct backend development:

```bash
# Set log level to debug
cargo run --manifest-path backend/Cargo.toml -- -L "info,didhub_backend=debug"
```

## Documentation

- [Developer Documentation](docs/developer/README.md) — Setup, architecture, code conventions, testing
- [User Documentation](docs/user/README.md) — Installation, usage, API reference
- [AI Agent Guidelines](AGENTS.md) — Code style and conventions for contributors

## Contributing

Contributions welcome! Please see [AGENTS.md](AGENTS.md) for code conventions.

## License

See [LICENSE](LICENSE) for license information.
