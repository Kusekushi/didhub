# API Reference

This document provides a concise overview of the DidHub REST API. The single source of truth is the OpenAPI specification located at the repository path:

- OpenAPI spec: ../../schemas/api/openapi.yaml

REST-based API
- The API follows REST principles. Resources are addressed via standard HTTP methods (GET, POST, PUT/PATCH, DELETE) and resource-oriented URLs.

Authentication
- Security definitions are defined in the OpenAPI spec. See the securitySchemes section for details. Common patterns include Bearer tokens in the Authorization header and API keys in headers, as described in the spec.

Common endpoint patterns
- List resources: GET /v1/{resource}
- Create resource: POST /v1/{resource}
- Retrieve a single resource: GET /v1/{resource}/{id}
- Update a resource: PATCH /v1/{resource}/{id} or PUT /v1/{resource}/{id}
- Delete a resource: DELETE /v1/{resource}/{id}
- Nested resources: /v1/{resource}/{id}/{subresource}
- Pagination and filtering: ?page=, ?limit=, ?sort=, ?filter=

Usage examples
- List items: curl -H "Authorization: Bearer {TOKEN}" "{BASE_URL}/v1/items"
- Create an item: curl -X POST -H "Authorization: Bearer {TOKEN}" -H "Content-Type: application/json" -d '{"name":"Example"}' "{BASE_URL}/v1/items"
- Get an item by id: curl -H "Authorization: Bearer {TOKEN}" "{BASE_URL}/v1/items/{id}"

Where to find more details
- The OpenAPI YAML is the definitive source for endpoints, parameters, request/response formats, and authentication. You can generate user-friendly docs from it using Swagger UI, ReDoc, or Stoplight.
- For quick onboarding, you can view interactive docs if your environment hosts a Swagger UI or ReDoc instance wired to the OpenAPI spec, or generate static docs locally.
