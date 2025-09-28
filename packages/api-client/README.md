# @didhub/api-client

A TypeScript client library for interacting with the DIDHub REST API. Provides typed functions for all API endpoints, automatic JWT token management, and error handling.

## Installation

This package is part of the DIDHub workspace. Install from the workspace root:

```bash
pnpm install
```

## Usage

Import functions from the main module:

```typescript
import {
  loginUser,
  fetchMe,
  listAlters,
  createAlter,
  uploadFile
} from '@didhub/api-client';
```

### Authentication

```typescript
// Register a new user
const registerResult = await registerUser('username', 'password');

// Login (automatically stores JWT token)
const loginResult = await loginUser('username', 'password');
if (loginResult.status === 200) {
  console.log('Logged in successfully');
}

// Get current user info
const user = await fetchMe();

// Logout (clears stored token)
await logoutUser();
```

### Working with Alters

```typescript
// List alters with pagination
const alters = await listAlters({ page: 1, per_page: 20 });

// Create a new alter
const newAlter = await createAlter({
  name: 'Alter Name',
  description: 'Description',
  system_id: 1
});

// Update an alter
const updatedAlter = await updateAlter(alterId, {
  name: 'New Name',
  avatar_url: 'https://example.com/avatar.jpg'
});

// Delete an alter
await deleteAlter(alterId);
```

### File Uploads

```typescript
// Upload a file
const uploadResult = await uploadFile(file, {
  alt_text: 'Description of the image',
  is_public: true
});

// List uploaded files
const files = await listFiles({ page: 1, per_page: 10 });
```

### Admin Functions

```typescript
// List users (admin only)
const users = await listUsers('', 1, 50, { is_approved: false });

// Approve a user
await approveUser(userId);

// View audit logs
const auditLogs = await listAuditLogs({ page: 1 });
```

## API Response Format

All functions return an `ApiFetchResult` object:

```typescript
interface ApiFetchResult {
  status: number;
  json?: any;
  text?: string;
  ok: boolean;
}
```

## Automatic Token Management

The client automatically:
- Attaches JWT tokens from `localStorage['didhub_jwt']` to requests
- Refreshes expired tokens using `/api/auth/refresh`
- Dispatches `didhub:unauthorized` events on auth failures
- Handles CORS and content-type headers

## Error Handling

Check the `status` and `ok` properties:

```typescript
const result = await createAlter(alterData);
if (!result.ok) {
  console.error('Failed to create alter:', result.status, result.json);
}
```

## Available Modules

- **Alter**: Functions for managing alters (create, read, update, delete)
- **User**: User registration, login, profile management
- **Files**: File upload, download, and management
- **Admin**: Administrative functions (user approval, audit logs, settings)
- **Group**: Group management for organizing alters
- **Subsystem**: Subsystem operations
- **Shortlink**: URL shortening functionality
- **OIDC**: OpenID Connect integration

## Building

```bash
pnpm --filter @didhub/api-client build
```

## Testing

```bash
pnpm --filter @didhub/api-client test
```

## Development

When adding new API endpoints:
1. Add the function to the appropriate module in `src/modules/`
2. Export it from `src/index.ts`
3. Add JSDoc comments for TypeScript intellisense
4. Update this README with usage examples
