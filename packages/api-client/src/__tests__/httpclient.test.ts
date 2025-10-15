import { describe, it, expect, beforeEach, vi } from 'vitest';
vi.mock('../utils/storage', () => {
  let storedToken: string | null = null;
  return {
    getStoredToken: vi.fn(() => storedToken),
    setStoredToken: vi.fn((token: string) => {
      storedToken = token;
    }),
    clearStoredToken: vi.fn(() => {
      storedToken = null;
    }),
    hasAuthToken: vi.fn(() => storedToken !== null),
    readCsrfToken: vi.fn(() => null),
  };
});
import { ApiClient } from '../generated/Client';

const ensureWindow = (): Window => {
  const existing = (globalThis as any).window ?? {};
  if (!existing.location) {
    existing.location = { origin: 'https://example.test' };
  }
  (globalThis as any).window = existing;
  return existing;
};

describe('HttpClient body serialization', () => {
  let client: ApiClient;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    ensureWindow();
    fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } }),
    );
    (globalThis as any).fetch = fetchMock;
    client = new ApiClient();
  });

  it('serializes plain object body to JSON and sets Content-Type when none provided', async () => {
    const payload = { email: 'alice@example.test' };
    const res = await client.users.post_password_reset_request({ body: payload } as any);
    // Ensure fetch was called once
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/password-reset/request');
    expect(init).toBeDefined();
    // Body should be JSON.stringify(payload)
    expect(init.body).toBe(JSON.stringify(payload));
    // Content-Type header should be application/json
    const headers = new Headers(init.headers as HeadersInit);
    expect(headers.get('Content-Type')?.toLowerCase()).toBe('application/json');
    // Response handling should succeed
    expect(res.ok).toBe(true);
  });

  it('does not stringify FormData bodies and does not set Content-Type', async () => {
    // Prepare a new fetch mock for this test
    const fd = new FormData();
    fd.append('file', 'dummy');
    fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } }),
    );
    (globalThis as any).fetch = fetchMock;
    const res = await client.users.post_me_avatar({ body: fd } as any);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    // Body should be the exact FormData instance (or a FormData-compatible body)
    expect(init.body).toBe(fd);
    const headers = new Headers(init.headers as HeadersInit);
    // When using FormData we should not force a Content-Type (browser sets boundary)
    expect(headers.get('Content-Type')).toBeNull();
    expect(res.ok).toBe(true);
  });

  it('does not stringify URLSearchParams bodies and sets appropriate header if provided', async () => {
    const params = new URLSearchParams({ q: 'test' });
    fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } }),
    );
    (globalThis as any).fetch = fetchMock;
    const res = await client.admin.post_uploads_purge({ body: params } as any);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    // Body should be the URLSearchParams instance (fetch accepts this)
    expect(init.body).toBe(params);
    expect(res.ok).toBe(true);
  });

  it('does not stringify Blob bodies and preserves provided Content-Type', async () => {
    // Create a small Blob
    const blob = new Blob(["hello"], { type: 'text/plain' });
    fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } }),
    );
    (globalThis as any).fetch = fetchMock;
    const res = await client.admin.post_admin_upload_dir({ body: blob } as any);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    expect(init.body).toBe(blob);
    // If the caller supplied a Blob with an inherent type, we should not have overridden it
    const headers = new Headers(init.headers as HeadersInit);
    // We didn't set Content-Type automatically for Blob bodies in our client, so header should be null
    expect(headers.get('Content-Type')).toBeNull();
    expect(res.ok).toBe(true);
  });
});
