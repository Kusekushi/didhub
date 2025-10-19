# DIDAlterHub

DIDAlterHub is an open-source platform for managing Dissociative Identity Disorder (DID) related data and workflows.

Tech stack
- **Backend**: Rust (Axum) with multiple crates under `backend/`
- **Frontend**: React + TypeScript in `frontend/app/`
- **Build & Tooling**: Python scripts in `build_tools/` for codegen, builds, and release
- **Runtime Tools**: Zig-based utilities in `runtime_tools/`

Quick start (developer)
1. Clone the repo:

```bash
git clone https://github.com/Kusekushi/didhub.git
cd didhub
```

2. Set up development prerequisites (install Rust, Node.js, pnpm, Python, and Zig). See `docs/developer/01-prerequisites.md` (coming soon).

3. Prepare Python environment and install build-tool dependencies:

```pwsh
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r build_tools/requirements.txt
```

4. (Optional) Install Node dependencies for frontend development:

```pwsh
cd frontend/app
pnpm install
cd ../..
```

5. Run the dev environment (high-level wrapper):

```pwsh
python build.py dev
```

6. Run tests:

```pwsh
python build.py test
```

Where to go next
- Developer docs: `docs/developer/` (structure and detailed guides)
- User docs: `docs/user/` (quick start, installation, usage)
- Build tooling: `build_tools/` (codegen, build scripts)

Contributing & license
- See `LICENSE` for license information.
