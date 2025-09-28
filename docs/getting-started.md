# Getting Started with DIDHub

This guide will help you set up DIDHub for development on your local machine.

## Prerequisites

### System Requirements

- **Operating System**: Windows 10+, macOS 10.15+, or Linux
- **Node.js**: Version 20 or higher (recommended)
- **pnpm**: Package manager (install via `npm install -g pnpm`)
- **Rust**: Latest stable version (1.70+)
- **Git**: For cloning the repository

### Optional Dependencies

- **Docker**: For containerized development and testing
- **PostgreSQL/MySQL**: For database development (SQLite works out of the box)
- **Redis**: For session caching and background job queuing

## Installation

### 1. Clone the Repository

```bash
git clone https://github.com/Kusekushi/didhub.git
cd didhub
```

### 2. Install Dependencies

Install all workspace dependencies:

```bash
pnpm install
```

This will install dependencies for the frontend, API client, and build tools.

### 3. Set Up Rust Environment

Ensure Rust is installed and up to date:

```bash
rustc --version
cargo --version
```

If Rust is not installed, follow the instructions at [rustup.rs](https://rustup.rs/).

## Development Setup

### Quick Start (SQLite)

DIDHub can run with SQLite out of the box, which requires no additional setup.

1. **Start the Rust backend server:**

   ```bash
   cd server-rs
   cargo run
   ```

   The server will start on `http://localhost:6000` by default.

2. **Start the frontend development server:**

   ```bash
   pnpm -F @didhub/frontend dev
   ```

   The frontend will be available at `http://localhost:5173`.

3. **Access the application:**

   Open `http://localhost:5173` in your browser.

### Database Configuration

#### SQLite (Default)

No configuration needed. The database file will be created automatically at `server-rs/data/didhub.sqlite`.

#### PostgreSQL

1. Install PostgreSQL and create a database:

   ```bash
   createdb didhub
   ```

2. Set the database URL:

   ```bash
   export DIDHUB_DB=postgres://username:password@localhost:5432/didhub
   ```

#### MySQL

1. Install MySQL and create a database:

   ```sql
   CREATE DATABASE didhub;
   ```

2. Set the database URL:

   ```bash
   export DIDHUB_DB=mysql://username:password@localhost:3306/didhub
   ```

### Environment Variables

Create a `.env` file in the server-rs directory or set environment variables:

```bash
# Required for production, optional for development
export DIDHUB_SECRET=your-super-secret-jwt-key-here

# Database URL (optional, defaults to SQLite)
export DIDHUB_DB=sqlite:///path/to/didhub.sqlite

# Server configuration
export PORT=6000
export HOST=0.0.0.0

# CORS configuration
export FRONTEND_BASE_URL=http://localhost:5173
```

## First Run

1. **Register an admin user:**

   The first user to register becomes an admin. Visit the application and create an account.

2. **Explore the interface:**

   - Create systems and alters
   - Upload avatars and files
   - Configure settings
   - View audit logs (admin only)

## Development Workflow

### Building

```bash
# Build everything
pnpm run build

# Build only frontend
pnpm -F @didhub/frontend build

# Build only API client
pnpm -F @didhub/api-client build
```

### Testing

```bash
# Run all tests
pnpm run test

# Run frontend tests
pnpm -F @didhub/frontend test

# Run API client tests
pnpm -F @didhub/api-client test

# Run backend tests
cd server-rs && cargo test
```

### Code Quality

```bash
# Lint all code
pnpm run lint

# Format code
pnpm run format
```

## Project Structure

```
didhub/
├── server-rs/              # Rust backend
│   ├── src/               # Server source code
│   ├── Cargo.toml         # Rust dependencies
│   └── config.example.json # Configuration template
├── packages/
│   ├── frontend/          # React frontend
│   │   ├── src/          # Frontend source code
│   │   └── package.json  # Frontend dependencies
│   └── api-client/        # TypeScript API client
├── docs/                  # Documentation
├── scripts/               # Build and utility scripts
└── static/                # Built frontend assets
```

## Next Steps

- Read the [Architecture](./architecture.md) guide to understand the system
- Check out the [API Reference](./api.md) for backend integration
- Learn about [Configuration](./configuration.md) options
- See [Contributing](./contributing.md) for development guidelines

## Troubleshooting

### Common Issues

**Frontend won't start:**
- Ensure Node.js 20+ is installed
- Try clearing node_modules: `rm -rf node_modules && pnpm install`

**Backend won't compile:**
- Update Rust: `rustup update`
- Clear cargo cache: `cargo clean`

**Database connection fails:**
- Check database URL format
- Ensure database server is running
- Verify credentials

For more help, see the [Troubleshooting](./troubleshooting.md) guide.