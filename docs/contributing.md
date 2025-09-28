# Contributing to DIDHub

Thank you for your interest in contributing to DIDHub! This guide covers the development workflow, coding standards, and contribution process.

## Development Setup

### Prerequisites

- **Node.js 20+** and **pnpm**
- **Rust 1.70+** with Cargo
- **Git**
- Optional: Docker, PostgreSQL/MySQL for testing

### Initial Setup

1. **Fork and clone the repository**

   ```bash
   git clone https://github.com/yourusername/didhub.git
   cd didhub
   git remote add upstream https://github.com/Kusekushi/didhub.git
   ```

2. **Install dependencies**

   ```bash
   pnpm install
   ```

3. **Set up pre-commit hooks** (optional)

   ```bash
   # Install husky
   pnpm dlx husky install

   # Set up commit hooks
   echo "pnpm run lint && pnpm run test" > .husky/pre-commit
   ```

### Development Workflow

1. **Create a feature branch**

   ```bash
   git checkout -b feature/your-feature-name
   # or
   git checkout -b fix/issue-number-description
   ```

2. **Make your changes**

   - Follow the coding standards below
   - Write tests for new functionality
   - Update documentation as needed

3. **Run quality checks**

   ```bash
   # Lint code
   pnpm run lint

   # Run tests
   pnpm run test

   # Format code
   pnpm run format
   ```

4. **Test your changes**

   ```bash
   # Start development servers
   pnpm -F @didhub/frontend dev &
   cd server-rs && cargo run &
   ```

5. **Commit your changes**

   ```bash
   git add .
   git commit -m "feat: add new feature description"
   ```

   Use conventional commit format:
   - `feat:` for new features
   - `fix:` for bug fixes
   - `docs:` for documentation
   - `style:` for formatting
   - `refactor:` for code restructuring
   - `test:` for test additions
   - `chore:` for maintenance

6. **Push and create PR**

   ```bash
   git push origin feature/your-feature-name
   ```

   Create a pull request on GitHub.

## Coding Standards

### Rust Code

#### Formatting

Use `rustfmt` for consistent formatting:

```bash
cargo fmt
```

#### Linting

Use `clippy` for code quality:

```bash
cargo clippy
```

#### Documentation

- Add doc comments to all public APIs
- Use `cargo doc` to generate documentation
- Follow Rust documentation conventions

#### Error Handling

- Use `anyhow` for application errors
- Use `thiserror` for library crate errors
- Prefer `Result<T, E>` over panics

#### Async Code

- Use `tokio` for async runtime
- Prefer `async fn` over manual futures
- Use `?` operator for error propagation

### TypeScript/React Code

#### Code Style

- Use ESLint and Prettier
- Follow React best practices
- Use TypeScript strict mode
- Prefer functional components with hooks

#### File Organization

```
src/
├── components/     # Reusable UI components
├── pages/         # Route components
├── hooks/         # Custom hooks
├── utils/         # Utility functions
├── types/         # Type definitions
└── contexts/      # React contexts
```

#### Naming Conventions

- **Components**: PascalCase (`UserProfile.tsx`)
- **Hooks**: camelCase with `use` prefix (`useAuth.ts`)
- **Utilities**: camelCase (`formatDate.ts`)
- **Types**: PascalCase with descriptive names (`User`, `ApiResponse`)

#### Testing

- Write unit tests for utilities and hooks
- Write integration tests for components
- Use Vitest for testing framework
- Aim for good test coverage

## Testing

### Backend Tests

```bash
# Run all tests
cd server-rs && cargo test

# Run specific test
cargo test test_name

# Run with coverage (requires cargo-tarpaulin)
cargo tarpaulin --ignore-tests
```

### Frontend Tests

```bash
# Unit tests
pnpm -F @didhub/frontend test

# E2E tests
pnpm -F @didhub/frontend e2e

# Coverage
pnpm -F @didhub/frontend test:coverage
```

### Integration Tests

```bash
# Run integration tests (requires Docker)
pnpm run test:e2e
```

## Documentation

### Code Documentation

- **Rust**: Use `///` doc comments for public APIs
- **TypeScript**: Use JSDoc comments for complex functions
- **READMEs**: Keep package READMEs up to date

### External Documentation

- Update docs in `docs/` folder as needed
- Add examples for new features
- Update API documentation for backend changes

## Pull Request Process

### Before Submitting

1. **Update branch**

   ```bash
   git fetch upstream
   git rebase upstream/main
   ```

2. **Run full test suite**

   ```bash
   pnpm run test
   pnpm run lint
   ```

3. **Update documentation**

   - Add doc comments for new APIs
   - Update READMEs if needed
   - Add migration notes for database changes

### PR Template

Use this template for pull requests:

```markdown
## Description
Brief description of the changes.

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update
- [ ] Refactoring

## Testing
- [ ] Unit tests added/updated
- [ ] Integration tests added/updated
- [ ] Manual testing completed

## Checklist
- [ ] Code follows style guidelines
- [ ] Documentation updated
- [ ] Tests pass
- [ ] No breaking changes
```

### Review Process

1. **Automated checks** run on CI
2. **Code review** by maintainers
3. **Testing** in staging environment
4. **Approval** and merge

## Issue Reporting

### Bug Reports

When reporting bugs, include:

- **Steps to reproduce**
- **Expected behavior**
- **Actual behavior**
- **Environment** (OS, browser, versions)
- **Logs** or error messages

### Feature Requests

For new features, provide:

- **Use case** and problem statement
- **Proposed solution**
- **Alternatives considered**
- **Mockups** or examples if applicable

## Security

### Reporting Security Issues

- **DO NOT** create public GitHub issues for security vulnerabilities
- Email security concerns to maintainers
- Include detailed reproduction steps

### Security Best Practices

- Never commit secrets or credentials
- Use environment variables for configuration
- Follow OWASP guidelines
- Keep dependencies updated

## Community

### Code of Conduct

- Be respectful and inclusive
- Focus on constructive feedback
- Help newcomers learn

### Getting Help

- **Documentation**: Check `docs/` folder first
- **Issues**: Search existing issues on GitHub
- **Discussions**: Use GitHub Discussions for questions

## Recognition

Contributors are recognized in:

- GitHub contributor statistics
- CHANGELOG.md for significant contributions
- Release notes

Thank you for contributing to DIDHub! 🎉