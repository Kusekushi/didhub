# DIDHub API Documentation

This document describes the REST API endpoints provided by the DIDHub Rust server.

## Base URL

All API endpoints are prefixed with `/api`.

## Authentication

Most endpoints require authentication via JWT token in the `Authorization: Bearer <token>` header.

### Authentication Endpoints

#### POST /api/auth/register
Register a new user account.

**Request Body:**
```json
{
  "username": "string",
  "password": "string",
  "is_system": false
}
```

**Response:**
```json
{
  "token": "string"
}
```

#### POST /api/auth/login
Authenticate and receive JWT token.

**Request Body:**
```json
{
  "username": "string",
  "password": "string"
}
```

**Response:**
```json
{
  "token": "string"
}
```

#### POST /api/auth/refresh
Refresh an existing JWT token.

**Headers:**
- `Authorization: Bearer <existing_token>`

**Response:**
```json
{
  "token": "string"
}
```

## User Management

#### GET /api/me
Get current user information.

**Response:**
```json
{
  "id": 1,
  "username": "string",
  "is_admin": false,
  "is_system": false,
  "is_approved": true
}
```

#### GET /api/users
List users (admin only).

**Query Parameters:**
- `q`: Search query
- `page`: Page number (default: 1)
- `per_page`: Items per page (default: 50)
- `is_system`: Filter by system accounts
- `is_admin`: Filter by admin accounts
- `is_approved`: Filter by approval status

#### GET /api/users/:id
Get user by ID (admin only).

#### PUT /api/users/:id
Update user (admin only).

## Alter Management

#### GET /api/alters
List alters.

**Query Parameters:**
- `q`: Search query
- `system_id`: Filter by system
- `page`: Page number
- `per_page`: Items per page

#### POST /api/alters
Create a new alter.

**Request Body:**
```json
{
  "name": "string",
  "description": "string",
  "system_id": 1,
  "avatar_url": "string"
}
```

#### GET /api/alters/:id
Get alter by ID.

#### PUT /api/alters/:id
Update alter.

#### DELETE /api/alters/:id
Delete alter.

## System Management

#### GET /api/systems
List systems.

#### POST /api/systems
Create system.

#### GET /api/systems/:id
Get system.

#### PUT /api/systems/:id
Update system.

#### DELETE /api/systems/:id
Delete system.

## Group Management

#### GET /api/groups
List groups.

#### POST /api/groups
Create group.

#### GET /api/groups/:id
Get group.

#### PUT /api/groups/:id
Update group.

#### DELETE /api/groups/:id
Delete group.

## File Uploads

#### POST /api/uploads
Upload a file.

**Content-Type:** `multipart/form-data`

**Form Fields:**
- `file`: The file to upload
- `alt_text`: Alternative text description
- `is_public`: Whether the file is publicly accessible

#### GET /api/uploads
List uploaded files.

#### GET /api/uploads/:id
Get file metadata.

#### DELETE /api/uploads/:id
Delete file.

## Admin Endpoints

All admin endpoints require admin authentication.

#### GET /api/admin/audit
Get audit logs.

#### POST /api/admin/audit/purge
Purge old audit logs.

#### GET /api/admin/settings
Get application settings.

#### PUT /api/admin/settings
Update settings.

#### GET /api/admin/system-requests
List system account requests.

#### POST /api/admin/system-requests/:id/decide
Approve or deny system request.

## Health Check

#### GET /health
Server health check (public).

**Response:**
```json
{
  "status": "ok",
  "database": "ok",
  "version": "1.0.0"
}
```

## Error Responses

All endpoints return standard HTTP status codes. Error responses include a JSON body:

```json
{
  "error": "Error message"
}
```