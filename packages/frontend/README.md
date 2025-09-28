# DIDHub Frontend

A modern React application built with Vite, Material-UI, and TypeScript for managing alters and systems in DID (Dissociative Identity Disorder) communities.

## Features

- **System Management**: Create and manage multiple systems and alters
- **User Authentication**: Secure login/logout with JWT tokens
- **File Uploads**: Upload and manage avatars and other media
- **Admin Panel**: Administrative functions for managing users and system requests
- **Responsive Design**: Mobile-friendly interface using Material-UI
- **Real-time Updates**: Live updates for system changes and notifications

## Tech Stack

- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite
- **UI Library**: Material-UI (MUI)
- **Routing**: React Router
- **State Management**: React Context API
- **API Client**: Custom `@didhub/api-client` library
- **Testing**: Vitest for unit tests, Playwright for E2E tests
- **Linting**: ESLint with TypeScript support

## Development Setup

### Prerequisites

- Node.js >= 20
- pnpm package manager
- Rust backend running (see root README)

### Installation

From the workspace root:

```bash
pnpm install
```

### Running in Development

Start the Vite dev server:

```bash
pnpm -F @didhub/frontend dev
```

The app will be available at `http://localhost:5173` by default.

### Building for Production

```bash
pnpm -F @didhub/frontend build
```

### Testing

#### Unit Tests

```bash
pnpm -F @didhub/frontend test
```

#### End-to-End Tests

```bash
pnpm -F @didhub/frontend e2e
```

Note: E2E tests require Playwright browsers to be installed. Run `npx playwright install` if needed.

## Project Structure

```
src/
├── components/          # Reusable UI components
│   ├── common/         # Generic components (buttons, forms, etc.)
│   ├── layout/         # Layout components (header, sidebar, etc.)
│   └── specific/       # Feature-specific components
├── pages/              # Page components (routed views)
├── hooks/              # Custom React hooks
├── contexts/           # React context providers
├── utils/              # Utility functions
├── test/               # Test utilities
└── main.tsx            # Application entry point
```

## Environment Variables

Create a `.env.local` file in this directory:

```env
# API proxy target for development
VITE_API_PROXY_TARGET=http://localhost:6000
```

## Authentication

The frontend integrates with the Rust backend's JWT-based authentication:

- Tokens are stored in `localStorage` under `didhub_jwt`
- Automatic token refresh is handled by the API client
- Unauthorized requests trigger a logout and redirect to login

## API Integration

Uses the `@didhub/api-client` package for all backend communication. The client automatically:

- Attaches JWT tokens to requests
- Handles token refresh on 401 responses
- Dispatches custom events for auth state changes

## Contributing

- Follow the existing code style and component patterns
- Add tests for new features
- Update this README when adding new features
- Ensure accessibility compliance with Material-UI standards

## Deployment

The built frontend is served by the Rust backend from the `static/` directory. For production deployment, build the frontend and ensure the backend is configured to serve static files.