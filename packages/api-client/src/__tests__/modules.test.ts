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

import { ApiClient } from '../client';
import { getShortLinkPath, getShortLinkUrl } from '../modules/Shortlink';
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

const textResponse = (text: string, status = 200, headers: HeadersInit = {}) =>
  new Response(text, {
    status,
    headers: { 'content-type': 'text/plain', ...headers },
  });

const createTestFile = (): File => new File(['hello world'], 'sample.txt', { type: 'text/plain' });

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
    it('login stores token and posts credentials', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ token: 'abc' }));

      const result = await client.users.login('user', 'pass');

      expect(fetchMock).toHaveBeenCalledWith(
        '/api/auth/login',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ username: 'user', password: 'pass' }),
        }),
      );
      expect(result.ok).toBe(true);
      expect(setStoredToken).toHaveBeenCalledWith('abc');
      expect(getStoredToken()).toBe('abc');
    });

    it('register returns status payload', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ message: 'ok' }, 201));

      const result = await client.users.register('alice', 'pw', true);

      expect(fetchMock).toHaveBeenCalledWith(
        '/api/auth/register',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ username: 'alice', password: 'pw', is_system: true }),
        }),
      );
      expect(result.status).toBe(201);
      expect(result.ok).toBe(true);
    });

    it('list builds expected query parameters', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ items: [{ id: 7 }], total: 10, per_page: 2, offset: 4 }));

      const page = await client.users.list({
        query: 'alice',
        page: 3,
        perPage: 2,
        is_admin: true,
        is_system: false,
        is_approved: true,
        sort_by: 'name',
        order: 'desc',
      });

      const [url] = fetchMock.mock.calls[0];
      expect(String(url)).toContain('/api/users');
      expect(String(url)).toContain('q=alice');
      expect(String(url)).toContain('page=3');
      expect(String(url)).toContain('per_page=2');
      expect(String(url)).toContain('is_admin=1');
      expect(String(url)).toContain('is_system=0');
      expect(String(url)).toContain('is_approved=1');
      expect(page.items).toHaveLength(1);
      expect(page.total).toBe(10);
      expect(page.limit).toBe(2);
      expect(page.offset).toBe(4);
    });

    it('sessionIfAuthenticated short-circuits when no token', async () => {
      const user = await client.users.sessionIfAuthenticated();
      expect(user).toBeNull();
      expect(hasAuthToken).toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('session returns ok=false on unauthorized and dispatches event', async () => {
      const win = ensureWindow();
      fetchMock.mockResolvedValueOnce(jsonResponse(null, 401));

      const result = await client.users.session();

      expect(result.ok).toBe(false);
      expect(fetchMock).toHaveBeenCalledWith('/api/me', expect.anything());
      expect(win.dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'didhub:unauthorized' }));
    });

    it('sessionIfAuthenticated fetches when token present', async () => {
      setStoredToken('existing');
      fetchMock.mockResolvedValueOnce(jsonResponse({ id: 11 }, 200));

      const user = await client.users.sessionIfAuthenticated();

      expect(fetchMock).toHaveBeenCalled();
      expect(user?.id).toBe(11);
    });

    it('changePassword surfaces error payload', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'bad' }, 400));

      const result = await client.users.changePassword('old', 'new');

      expect(fetchMock).toHaveBeenCalledWith('/api/me/password', expect.objectContaining({ method: 'POST' }));
      expect(result.status).toBe(400);
      expect(result.error).toBe('bad');
      expect(result.ok).toBe(false);
    });

    it('refreshSession posts to refresh endpoint and stores token', async () => {
      setStoredToken('refresh-token');
      fetchMock.mockResolvedValueOnce(jsonResponse({ token: 'new-token' }, 200));

      const result = await client.users.refreshSession();

      expect(fetchMock).toHaveBeenCalledWith(
        '/api/auth/refresh',
        expect.objectContaining({
          method: 'POST',
        }),
      );
      expect(result.ok).toBe(true);
      expect(result.token).toBe('new-token');
      expect(getStoredToken()).toBe('new-token');
    });
  });

  describe('admin', () => {
    it('disableUser resets password and revokes approval', async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ success: true }, 200))
        .mockResolvedValueOnce(jsonResponse({}, 200));

      await client.admin.disableUser(7);

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock.mock.calls[0][0]).toBe('/api/users/7/reset');
      expect(fetchMock.mock.calls[1][0]).toBe('/api/users/7');
      expect(fetchMock.mock.calls[1][1]).toEqual(expect.objectContaining({ method: 'PUT' }));
    });

    it('auditLogs builds offset query and unwraps payload', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ items: [{ id: 1 }], total: 25 }));

      const logs = await client.admin.auditLogs({
        page: 3,
        perPage: 10,
        action: 'login',
        userId: 99,
        from: '2024-01-01',
        to: '2024-01-31',
      });

      const [url] = fetchMock.mock.calls[0];
      expect(String(url)).toContain('offset=20');
      expect(String(url)).toContain('limit=10');
      expect(String(url)).toContain('action=login');
      expect(String(url)).toContain('user_id=99');
      expect(logs.items).toHaveLength(1);
      expect(logs.total).toBe(25);
    });

    it('exportAuditCsv returns text payload with headers', async () => {
      fetchMock.mockResolvedValueOnce(textResponse('csv,data', 200, { 'content-type': 'text/csv' }));

      const result = await client.admin.exportAuditCsv();

      expect(fetchMock).toHaveBeenCalledWith(
        '/api/audit/export',
        expect.objectContaining({
          method: 'GET',
        }),
      );
      expect(result.content).toBe('csv,data');
      expect(result.contentType).toBe('text/csv');
    });

    it('redisStatus normalizes error responses', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ ok: false, error: 'down' }, 500));

      const status = await client.admin.redisStatus();

      expect(status.ok).toBe(false);
      expect(status.error).toBe('down');
    });

    it('performUpdate forwards query params', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ success: true, message: 'ok' }));

      const result = await client.admin.performUpdate({ check_only: true });

      const [url] = fetchMock.mock.calls[0];
      expect(String(url)).toContain('check_only=true');
      expect(result.success).toBe(true);
    });
  });

  describe('files', () => {
    it('upload posts FormData and returns filename', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ filename: '/uploads/file.png' }));
      const file = createTestFile();

      const result = await client.files.upload(file);

      expect(fetchMock).toHaveBeenCalledWith('/api/upload', expect.objectContaining({ method: 'POST' }));
      expect(fetchMock.mock.calls[0][1]?.body).toBeInstanceOf(FormData);
      expect(result.url).toBe('/uploads/file.png');
    });

    it('uploadWithProgress attaches headers and emits progress', async () => {
      class MockXhr {
        static instances: MockXhr[] = [];
        static DONE = 4;
        readyState = 0;
        status = 200;
        responseText = JSON.stringify({ filename: '/uploads/ok.png' });
        upload: Record<string, any> = {};
        headers: Record<string, string> = {};
        withCredentials = false;
        onreadystatechange: (() => void) | null = null;
        onerror: (() => void) | null = null;
        method?: string;
        url?: string;

        constructor() {
          MockXhr.instances.push(this);
        }

        open(method: string, url: string) {
          this.method = method;
          this.url = url;
        }

        setRequestHeader(key: string, value: string) {
          this.headers[key.toLowerCase()] = value;
        }

        send() {
          this.upload.onprogress?.({ lengthComputable: true, loaded: 5, total: 10 } as any);
          this.readyState = 4;
          this.onreadystatechange?.();
        }
      }

      (globalThis as any).XMLHttpRequest = MockXhr as any;
      setStoredToken('upload-token');
      vi.mocked(readCsrfToken).mockReturnValue('csrf-token');

      const file = createTestFile();
      const progress: number[] = [];

      const result = await client.files.uploadWithProgress(file, (pct) => progress.push(pct));

      const instance = MockXhr.instances[0];
      expect(instance).toBeDefined();
      expect(instance.withCredentials).toBe(true);
      expect(instance.headers.authorization).toBe('Bearer upload-token');
      expect(instance.headers['x-csrf-token']).toBe('csrf-token');
      expect(progress).toContain(50);
      expect(result.url).toBe('/uploads/ok.png');
    });

    it('uploadAvatar returns error when response lacks url', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'fail' }, 200));

      const result = await client.files.uploadAvatar(createTestFile());

      expect(fetchMock).toHaveBeenCalledWith('/api/me/avatar', expect.objectContaining({ method: 'POST' }));
      expect(result.error).toBe('fail');
    });

    it('deleteAvatar handles 404 gracefully', async () => {
      fetchMock.mockResolvedValueOnce(new Response('', { status: 404 }));

      const result = await client.files.deleteAvatar();

      expect(fetchMock).toHaveBeenCalledWith('/api/me/avatar', expect.objectContaining({ method: 'DELETE' }));
      expect(result).toBeNull();
    });
  });

  describe('groups', () => {
    it('list normalizes JSON fields and supports filters', async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse([{ id: 1, sigil: '{"icon":"a"}', leaders: '["l"]', metadata: '{"m":1}' }]),
      );

      const groups = await client.groups.list({ includeMembers: true, query: 'team', ownerUserId: 3 });

      const [url] = fetchMock.mock.calls[0];
      expect(String(url)).toContain('q=team');
      expect(String(url)).toContain('fields=members');
      expect(String(url)).toContain('owner_user_id=3');
      expect(groups[0].leaders).toEqual(['l']);
      expect(groups[0].metadata).toEqual({ m: 1 });
    });

    it('get returns null on 404', async () => {
      fetchMock.mockResolvedValueOnce(new Response('', { status: 404 }));

      const group = await client.groups.get(9);

      expect(group).toBeNull();
    });

    it('listMembers filters invalid alters', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ group_id: 1, alters: [1, '2', null, undefined] }));

      const members = await client.groups.listMembers(1);

      expect(fetchMock).toHaveBeenCalledWith('/api/groups/1/members', expect.anything());
      expect(members).toEqual({ group_id: 1, alters: [1, '2'] });
    });
  });

  describe('subsystems', () => {
    it('list applies query params and normalizes metadata', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ items: [{ id: 2, metadata: '{"foo":1}' }] }));

      const subsystems = await client.subsystems.list({ query: 'alpha', ownerUserId: 4, includeMembers: true });

      const [url] = fetchMock.mock.calls[0];
      expect(String(url)).toContain('q=alpha');
      expect(String(url)).toContain('owner_user_id=4');
      expect(String(url)).toContain('fields=members');
      expect(subsystems[0].metadata).toEqual({ foo: 1 });
    });

    it('migrateAlterAssignments hits admin endpoint', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }));

      const result = await client.subsystems.migrateAlterAssignments();

      expect(fetchMock).toHaveBeenCalledWith(
        '/admin/migrate-alter-subsystems',
        expect.objectContaining({ method: 'POST' }),
      );
      expect(result.ok).toBe(true);
    });
  });

  describe('alters', () => {
    it('list supports filters and normalizes arrays', async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({
          items: [
            {
              id: 5,
              interests: 'music, art',
              images: ['pic.jpg'],
              partners: '1',
              parents: '[2]',
              children: 3,
            },
          ],
          total: 1,
        }),
      );

      const page = await client.alters.list({ query: 'm', includeRelationships: true, perPage: 10, offset: 0 });

      const [url] = fetchMock.mock.calls[0];
      expect(String(url)).toContain('fields=id%2Cname');
      const firstAlter = page.items[0];
      expect(firstAlter).toBeDefined();
      if (!firstAlter) {
        throw new Error('Expected first alter to be defined');
      }
      expect(firstAlter.interests).toEqual(['music', 'art']);
      expect(firstAlter.partners).toEqual([1]);
      expect(firstAlter.parents).toEqual([2]);
      expect(firstAlter.children).toEqual([3]);
      expect(firstAlter.images).toBeDefined();
      if (!firstAlter.images) {
        throw new Error('Expected images to be defined');
      }
      expect(firstAlter.images[0]).toBe('/uploads/pic.jpg');
    });

    it('get returns null on 404', async () => {
      fetchMock.mockResolvedValueOnce(new Response('', { status: 404 }));

      const alter = await client.alters.get(5);

      expect(alter).toBeNull();
    });

    it('add and remove relationship hit expected endpoints', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({}, 200)).mockResolvedValueOnce(jsonResponse({}, 200));

      await client.alters.addRelationship(1, 2, 'partner');
      await client.alters.removeRelationship(1, 2, 'partner');

      expect(fetchMock.mock.calls[0][0]).toBe('/api/alters/1/relationships');
      expect(fetchMock.mock.calls[0][1]).toEqual(expect.objectContaining({ method: 'POST' }));
      expect(fetchMock.mock.calls[1][0]).toBe('/api/alters/1/relationships/2/partner');
      expect(fetchMock.mock.calls[1][1]).toEqual(expect.objectContaining({ method: 'DELETE' }));
    });
  });

  describe('shortlinks', () => {
    it('create returns parsed record', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ id: 7, token: 'tok', target: '/detail/7' }, 201));

      const record = await client.shortlinks.create('alter', 7);

      expect(fetchMock).toHaveBeenCalledWith('/api/shortlink', expect.objectContaining({ method: 'POST' }));
      expect(record).toEqual({ id: 7, token: 'tok', target: '/detail/7' });
    });

    it('create throws when payload is invalid', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'bad' }, 422));

      await expect(client.shortlinks.create('alter', 1)).rejects.toThrow('bad');
    });

    it('fetch returns ok result when record exists', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ id: 1, token: 'abc', target: '/detail/1' }, 200));

      const result = await client.shortlinks.fetch('abc');

      expect(fetchMock).toHaveBeenCalledWith('/api/shortlink/abc', expect.anything());
      expect(result.ok).toBe(true);
      expect(result.record?.token).toBe('abc');
    });

    it('fetch returns error details when not found', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'missing' }, 404));

      const result = await client.shortlinks.fetch('missing');

      expect(result.ok).toBe(false);
      expect(result.error).toBe('missing');
    });

    it('shortlink url helpers build expected paths', () => {
      const record = { id: 1, token: 'abc', target: '/detail/1' };
      expect(getShortLinkPath(record)).toBe('/s/abc');
      expect(getShortLinkUrl(record, 'https://example.test')).toBe('https://example.test/s/abc');
    });
  });

  describe('oidc', () => {
    it('list returns providers when ok', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse([{ id: 'google', name: 'Google' }]));

      const providers = await client.oidc.list();

      expect(fetchMock).toHaveBeenCalledWith('/api/oidc', expect.anything());
      expect(providers).toEqual([{ id: 'google', name: 'Google' }]);
    });

    it('list returns empty array when response not ok', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'fail' }, 500));

      const providers = await client.oidc.list();

      expect(providers).toEqual([]);
    });

    it('getSecret returns null when request fails', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({}, 500));

      const secret = await client.oidc.getSecret('google');

      expect(secret).toBeNull();
    });

    it('updateSecret posts body and returns payload', async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({
          id: 'google',
          name: 'Google',
          enabled: true,
          has_client_secret: true,
          client_id: 'new',
        }),
      );

      const secret = await client.oidc.updateSecret('google', { client_id: 'new' });

      expect(fetchMock).toHaveBeenCalledWith('/api/oidc/google/secret', expect.objectContaining({ method: 'POST' }));
      expect(secret?.client_id).toBe('new');
    });
  });
});
