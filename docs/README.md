# DIDHub Documentation

Welcome to the DIDHub documentation! This folder contains comprehensive guides and references for developing, deploying, and using DIDHub.

## Quick Start

- **[Getting Started](./getting-started.md)** - Development setup and prerequisites
- **[Running DIDHub](./running.md)** - How to run the application locally and in production

## Development

- **[Architecture](./architecture.md)** - System overview and component descriptions
- **[API Reference](./api.md)** - Complete REST API documentation
- **[Database](./database.md)** - Schema, migrations, and data models
- **[Configuration](./configuration.md)** - Environment variables and settings
- **[Contributing](./contributing.md)** - Development workflow and guidelines

## Deployment

- **[Deployment](./deployment.md)** - Docker, native binaries, and production setup
- **[Packaging](./packaging.md)** - Build and release processes

## Reference

- **[Audit Events](./audit-events.md)** - Audit logging reference
- **[Troubleshooting](./troubleshooting.md)** - Common issues and solutions

## Project Structure

```
DIDHub/
├── server-rs/          # Rust backend server
├── packages/
│   ├── frontend/       # React frontend application
│   └── api-client/     # TypeScript API client library
├── docs/               # This documentation folder
├── scripts/            # Build and utility scripts
└── static/             # Built frontend assets
```

## Support

For questions or issues not covered in this documentation, please check:

- [GitHub Issues](https://github.com/Kusekushi/didhub/issues)
- [GitHub Discussions](https://github.com/Kusekushi/didhub/discussions)

## License

DIDHub is licensed under MIT.