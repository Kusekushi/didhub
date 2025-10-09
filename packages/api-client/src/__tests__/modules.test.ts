import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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
import { setStoredToken, clearStoredToken, getStoredToken, hasAuthToken, readCsrfToken } from '../utils/storage';

const ensureWindow = (): Window & { dispatchEvent: ReturnType<typeof vi.fn> } => {
  const existing = (globalThis as any).window ?? {};
  if (!existing.location) {
    existing.location = { origin: 'https://example.test' };
  }
  existing.dispatchEvent = vi.fn();
  (globalThis as any).window = existing;
  return existing;
};

const jsonResponse = (body: unknown, status = 200, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });

describe('api-client modules', () => {
  let client: ApiClient;
  let fetchMock: ReturnType<typeof vi.fn>;
  const originalXHR = globalThis.XMLHttpRequest;

  beforeEach(() => {
    ensureWindow();
    fetchMock = vi.fn();
    (globalThis as any).fetch = fetchMock;
    client = new ApiClient();
    clearStoredToken();
    vi.mocked(readCsrfToken).mockReturnValue(null);
  });

  afterEach(() => {
    if (originalXHR) {
      (globalThis as any).XMLHttpRequest = originalXHR;
    } else {
      delete (globalThis as any).XMLHttpRequest;
    }
    vi.mocked(readCsrfToken).mockReturnValue(null);
  });

  describe('users', () => {
    it('password reset request sends email', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ success: true }));
      const result = await client.users.post_password_reset_request();
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/password-reset/request',
        expect.objectContaining({
          method: 'POST',
        }),
      );
      expect(result.ok).toBe(true);
    });

    it('password reset verify works', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ valid: true }));
      const result = await client.users.post_password_reset_verify();
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/password-reset/verify',
        expect.objectContaining({
          method: 'POST',
        }),
      );
      expect(result.ok).toBe(true);
    });

    it('password reset consume works', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ success: true }));
      const result = await client.users.post_password_reset_consume();
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/password-reset/consume',
        expect.objectContaining({
          method: 'POST',
        }),
      );
      expect(result.ok).toBe(true);
    });

    it('request system access works', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ requested: true }));
      const result = await client.users.post_me_request_system();
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/me/request-system',
        expect.objectContaining({
          method: 'POST',
        }),
      );
      expect(result.ok).toBe(true);
    });

    it('get system request status works', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ status: 'pending' }));
      const result = await client.users.get_me_request_system();
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/me/request-system',
        expect.objectContaining({
          method: 'GET',
        }),
      );
      expect(result.ok).toBe(true);
    });

    it('upload avatar works', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ uploaded: true }));
      const result = await client.users.post_me_avatar();
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/me/avatar',
        expect.objectContaining({
          method: 'POST',
        }),
      );
      expect(result.ok).toBe(true);
    });

    it('delete avatar works', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ deleted: true }));
      const result = await client.users.delete_me_avatar();
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/me/avatar',
        expect.objectContaining({
          method: 'DELETE',
        }),
      );
      expect(result.ok).toBe(true);
    });
  });
});
