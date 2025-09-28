import { vi, describe, it, expect, beforeEach } from 'vitest';

import * as Admin from '../modules/Admin';
import * as Subsystem from '../modules/Subsystem';
import * as Shortlink from '../modules/Shortlink';
import * as User from '../modules/User';
import * as OIDC from '../modules/OIDC';
import * as Group from '../modules/Group';
import * as Files from '../modules/Files';
import * as Alter from '../modules/Alter';
import { apiFetch } from '../Util';

// Mock the apiFetch function
vi.mock('../Util', () => ({
  apiFetch: vi.fn(),
  safeJsonParse: vi.fn((v, fallback) => {
    try {
      return JSON.parse(v);
    } catch {
      return fallback;
    }
  }),
  hasAuthToken: vi.fn(() => false),
  getStoredToken: vi.fn(() => null),
  clearStoredToken: vi.fn(),
  setStoredToken: vi.fn(),
  getTokenExp: vi.fn(() => null),
  refreshToken: vi.fn(() => Promise.resolve({ ok: false })),
}));

beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
  vi.mocked(apiFetch).mockResolvedValue({ status: 200, json: {} });
  // reset globals used by fetch/XHR tests
  (globalThis as any).fetch = undefined;
  (globalThis as any).XMLHttpRequest = undefined;
  try {
    delete (globalThis as any).__DIDHUB_CSRF_CACHE;
  } catch {}
});

describe('api-client', () => {
  describe('User', () => {
    it('logout path and listUsers extra params and fetchMeVerified happy path', async () => {
      // logoutUser doesn't make API calls
      await User.logoutUser();

      // listUsers with many opts
      vi.mocked(apiFetch).mockResolvedValueOnce({ status: 200, json: { items: [] } });
      await User.listUsers('z', 1, 20, { is_system: false, is_approved: true, sort_by: 'name', order: 'desc' });
      const ucall = vi.mocked(apiFetch).mock.calls[0][0];
      expect(ucall).toContain('is_system=0');
      expect(ucall).toContain('is_approved=1');
      expect(ucall).toContain('sort_by=name');

      // fetchMeVerified happy path - mock hasAuthToken to return true
      vi.mocked(apiFetch).mockResolvedValueOnce({ status: 200, json: { id: 7 } });
      const { hasAuthToken } = await import('../Util');
      vi.mocked(hasAuthToken).mockReturnValueOnce(true);
      const me = await User.fetchMeVerified();
      expect((me as any).id).toBe(7);
    });

    it('csrf caching, fetchMe, getUser, updateUser, listSystems', async () => {
      // loginUser calls /api/auth/login
      vi.mocked(apiFetch).mockResolvedValueOnce({ status: 200, json: { token: 't' } });
      await User.loginUser('a', 'b');
      expect(vi.mocked(apiFetch).mock.calls[0][0]).toBe('/api/auth/login');

      vi.mocked(apiFetch).mockResolvedValueOnce({ status: 200, json: { token: 't2' } });
      await User.loginUser('a2', 'b2');
      expect(vi.mocked(apiFetch).mock.calls[1][0]).toBe('/api/auth/login');

      // fetchMe error case
      vi.mocked(apiFetch).mockResolvedValueOnce({ status: 401 });
      const rFail = await User.fetchMe();
      expect(rFail.ok).toBe(false);
      expect(rFail.status).toBe(401);

      // fetchMe success case
      vi.mocked(apiFetch).mockResolvedValueOnce({ status: 200, json: { id: 1 } });
      const rOk = await User.fetchMe();
      expect((rOk as any).id).toBe(1);

      vi.mocked(apiFetch).mockResolvedValueOnce({ status: 200, json: { id: 9 } });
      const u = await User.getUser(9);
      expect((u as any).id).toBe(9);

      vi.mocked(apiFetch).mockResolvedValueOnce({ status: 200 });
      await User.updateUser(3, { x: 1 });
      expect(vi.mocked(apiFetch).mock.calls.some((c: any) => c[0] === '/api/users/3')).toBeTruthy();

      vi.mocked(apiFetch).mockResolvedValueOnce({ status: 200, json: { items: [{ id: 1 }] } });
      const systems = await User.listSystems();
      expect(Array.isArray(systems)).toBe(true);
    });

    it('loginUser passes credentials and returns response', async () => {
      vi.mocked(apiFetch).mockResolvedValue({ status: 200, json: { token: 't' } });
      const r = await User.loginUser('u', 'p');
      expect(vi.mocked(apiFetch).mock.calls[0][0]).toBe('/api/auth/login');
      expect(r.status).toBe(200);
    });

    it('registerUser posts payload', async () => {
      vi.mocked(apiFetch).mockResolvedValue({ status: 201 });
      const r = await User.registerUser('u2', 'pw');
      expect(vi.mocked(apiFetch).mock.calls[0][0]).toBe('/api/auth/register');
      expect(r.status).toBe(201);
    });

    it('fetchMeVerified returns null when session missing', async () => {
      const m = await User.fetchMeVerified();
      expect(m).toBeNull();
      expect(apiFetch).toHaveBeenCalledTimes(0);
    });

    it('listUsers constructs query params', async () => {
      vi.mocked(apiFetch).mockResolvedValue({ status: 200, json: { items: [], total: 0 } });
      await User.listUsers('abc', 2, 10, { is_admin: true });
      const calledUrl = vi.mocked(apiFetch).mock.calls[0][0];
      expect(calledUrl).toContain('q=abc');
      expect(calledUrl).toContain('page=2');
      expect(calledUrl).toContain('is_admin=1');
    });
  });

  describe('Admin', () => {
    it('getAdminSettings returns json or {}', async () => {
      vi.mocked(apiFetch).mockResolvedValue({ status: 200, json: { a: 1 } });
      const r = await Admin.getAdminSettings();
      expect(r).toEqual({ a: 1 });
    });

    it('getRedisStatus fallback', async () => {
      vi.mocked(apiFetch).mockResolvedValue({ status: 500, json: null });
      const r = await Admin.getRedisStatus();
      expect(r.ok).toBe(false);
    });

    it('basic flows', async () => {
      vi.mocked(apiFetch).mockResolvedValueOnce({ status: 200, json: { ok: true } });
      const r1 = await Admin.adminResetUserPassword(1, 'pw');
      expect(vi.mocked(apiFetch).mock.calls[0][0]).toBe('/api/users/1/reset');
      expect(r1).toEqual({ ok: true });

      // adminDisableUser will call reset then updateUser (both using apiFetch)
      vi.mocked(apiFetch).mockResolvedValueOnce({ status: 200 }).mockResolvedValueOnce({ status: 200 });
      await Admin.adminDisableUser(2);
      // should have called reset and update
      expect(vi.mocked(apiFetch).mock.calls[1][0]).toContain('/api/users/2/reset');

      vi.mocked(apiFetch).mockResolvedValueOnce({ status: 200, json: { items: [] } });
      await Admin.fetchAuditLogs({ page: 3, per_page: 10 });

      vi.mocked(apiFetch).mockResolvedValueOnce({ status: 200 });
      await Admin.exportAdminAuditCsv();

      vi.mocked(apiFetch).mockResolvedValueOnce({ status: 200, json: { ok: true } });
      await Admin.clearAuditLogs();

      vi.mocked(apiFetch).mockResolvedValueOnce({ status: 200, json: { id: 1 } });
      await Admin.requestSystemApproval();
      vi.mocked(apiFetch).mockResolvedValueOnce({ status: 200, json: { id: 2 } });
      await Admin.getMySystemRequest();

      vi.mocked(apiFetch).mockResolvedValueOnce({ status: 200, json: { items: [] } });
      await Admin.listSystemRequests();

      vi.mocked(apiFetch).mockResolvedValueOnce({ status: 200, json: { ok: true } });
      await Admin.setSystemRequestStatus(5, 'approved');

      vi.mocked(apiFetch).mockResolvedValueOnce({ status: 200, json: { a: 1 } });
      await Admin.updateAdminSettings({ x: 1 });

      vi.mocked(apiFetch).mockResolvedValueOnce({ status: 200, json: { ok: true } });
      await Admin.postDiscordBirthdays();

      vi.mocked(apiFetch).mockResolvedValueOnce({ status: 200, json: { items: [] } });
      await Admin.getAdminPosts(1, 5);

      vi.mocked(apiFetch).mockResolvedValueOnce({ status: 200, json: { ok: true } });
      await Admin.repostAdminPost('p');

      vi.mocked(apiFetch).mockResolvedValueOnce({ status: 200, json: { jobs: [] } });
      await Admin.listHousekeepingJobs();

      vi.mocked(apiFetch).mockResolvedValueOnce({ status: 200, json: { ok: true } });
      await Admin.runHousekeepingJob('job1');
      vi.mocked(apiFetch).mockResolvedValueOnce({ status: 200, json: { ok: true } });
      await Admin.runHousekeepingJob('job2', { dry: true });

      vi.mocked(apiFetch).mockResolvedValueOnce({ status: 200, json: { runs: [] } });
      await Admin.listHousekeepingRuns();

      vi.mocked(apiFetch).mockResolvedValueOnce({ status: 200, json: { ok: true } });
      await Admin.clearHousekeepingRuns();
    });
  });

  it('Files: uploadFileWithProgress onerror and uploadAvatar failure when upload has no url', async () => {
    // XHR that triggers onerror
    class ErrXhr {
      readyState = 0;
      status = 0;
      responseText = '';
      upload: any = {};
      onreadystatechange: any = null;
      onerror: any = null;
      open() {}
      send() {
        this.onerror && this.onerror(new Error('err'));
      }
    }
    (globalThis as any).XMLHttpRequest = ErrXhr as any;
    const fakeFile = new File(['x'], 'f.txt');
    const res = await Files.uploadFileWithProgress(fakeFile as any, () => {});
    expect(res.error).toBe('network_error');

    // uploadAvatar: simulate uploadFile returning no json/url by mocking global fetch used by uploadFile
    (globalThis as any).fetch = vi.fn().mockResolvedValue({ status: 200, text: async () => '' });
    const bad = await Files.uploadAvatar(new File(['a'], 'a.txt') as any);
    expect((bad as any).error).toBe('upload_failed');
  });

  it('Group: listGroups handles empty and getGroup null normalization', async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce({ status: 200, json: {} });
    const empty = await Group.listGroups();
    expect(Array.isArray(empty)).toBe(true);

    vi.mocked(apiFetch).mockResolvedValueOnce({ status: 200, json: null });
    const g = await Group.getGroup(1);
    expect(g).toBe(null);
  });

  it('Alter: error paths for fetchAltersSearch', async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce({ status: 500, json: null });
    const r = await Alter.fetchAltersSearch('u', 'q');
    expect((r as any).status).toBeDefined();
  });

  it('Subsystem: listSubsystems and get/create/update calls', async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce({ status: 200, json: { items: [] } });
    await Subsystem.listSubsystems('query', 'ownerX');
    expect(vi.mocked(apiFetch).mock.calls[0][0]).toContain('/api/subsystems');
    expect(vi.mocked(apiFetch).mock.calls[0][0]).toContain('q=query');
    expect(vi.mocked(apiFetch).mock.calls[0][0]).toContain('owner_user_id=ownerX');

    vi.mocked(apiFetch).mockResolvedValueOnce({ status: 200, json: { id: 1 } });
    await Subsystem.getSubsystem(1);
    expect(vi.mocked(apiFetch).mock.calls[1][0]).toBe('/api/subsystems/1');

    vi.mocked(apiFetch).mockResolvedValueOnce({ status: 201 });
    await Subsystem.createSubsystem({ a: 1 } as any);
    expect(vi.mocked(apiFetch).mock.calls[2][0]).toBe('/api/subsystems');

    vi.mocked(apiFetch).mockResolvedValueOnce({ status: 200 });
    await Subsystem.updateSubsystem(2, { b: 2 } as any);
    expect(vi.mocked(apiFetch).mock.calls[3][0]).toBe('/api/subsystems/2');

    vi.mocked(apiFetch).mockResolvedValueOnce({ status: 200, json: { members: [] } });
    await Subsystem.listSubsystemMembers(3);
    expect(vi.mocked(apiFetch).mock.calls[4][0]).toBe('/api/subsystems/3/members');

    vi.mocked(apiFetch).mockResolvedValueOnce({ status: 200, json: {} });
    await Subsystem.toggleSubsystemLeader(4, 5, false);
    expect(vi.mocked(apiFetch).mock.calls[5][0]).toBe('/api/subsystems/4/leaders/toggle');

    vi.mocked(apiFetch).mockResolvedValueOnce({ status: 200 });
    await Subsystem.setSubsystemMemberRoles(4, 5, ['r']);
    expect(vi.mocked(apiFetch).mock.calls[6][0]).toBe('/api/subsystems/4/members/roles');

    vi.mocked(apiFetch).mockResolvedValueOnce({ status: 200, json: { items: [] } });
    await Subsystem.migrateAlterSubsystems();
  });

  it('Shortlink: create and get with success and error path', async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce({ status: 201, json: { token: 't' } });
    const created = await Shortlink.createShortLink('alter', 123);
    expect(vi.mocked(apiFetch).mock.calls[0][0]).toBe('/api/shortlink');
    expect(vi.mocked(apiFetch).mock.calls[0][1]).toEqual({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target: '/detail/123' }),
    });
    expect(created).toEqual({ token: 't' });

    vi.mocked(apiFetch).mockResolvedValueOnce({ status: 200, json: { target_type: 'a', target_id: '1' } });
    const rec = await Shortlink.getShortlinkRecord('tok');
    expect(vi.mocked(apiFetch).mock.calls[1][0]).toBe('/api/shortlink/tok');
    expect((rec as any).target_type).toBe('a');

    vi.mocked(apiFetch).mockResolvedValueOnce({ status: 404, json: null });
    const err = await Shortlink.getShortlinkRecord('bad');
    expect((err as any).status).toBe(404);
  });

  it('OIDC: fetchOidcList handles ok/not-ok and errors', async () => {
    // successful fetch
    (globalThis as any).fetch = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ items: [{ id: '1', name: 'n' }] }) });
    const list = await OIDC.fetchOidcList();
    expect(list.length).toBe(1);

    // non-ok
    (globalThis as any).fetch = vi.fn().mockResolvedValue({ ok: false });
    const empty = await OIDC.fetchOidcList();
    expect(empty).toEqual([]);

    // throws
    (globalThis as any).fetch = vi.fn().mockRejectedValue(new Error('boom'));
    const alsoEmpty = await OIDC.fetchOidcList();
    expect(alsoEmpty).toEqual([]);
  });

  it('Group: listGroups/getGroup normalizes JSON fields', async () => {
    const raw = {
      id: 1,
      sigil: JSON.stringify({ ok: true }),
      leaders: JSON.stringify(['a']),
      metadata: JSON.stringify({ m: 1 }),
    };
    vi.mocked(apiFetch).mockResolvedValueOnce({ status: 200, json: [raw] });
    const ls = await Group.listGroups();
    expect(Array.isArray(ls)).toBe(true);
    expect((ls[0] as any).sigil).toEqual({ ok: true });

    vi.mocked(apiFetch).mockResolvedValueOnce({ status: 200, json: { items: [raw] } });
    const ls2 = await Group.listGroups('q');
    expect((ls2[0] as any).leaders).toEqual(['a']);

    vi.mocked(apiFetch).mockResolvedValueOnce({ status: 200, json: raw });
    const g = await Group.getGroup(10);
    expect((g as any).metadata).toEqual({ m: 1 });

    vi.mocked(apiFetch).mockResolvedValueOnce({ status: 204 });
    await Group.createGroup({});
    await Group.updateGroup(1, {});
    await Group.deleteGroup(1);
    vi.mocked(apiFetch).mockResolvedValueOnce({ status: 200, json: { items: [] } });
    await Group.listGroupMembers(1);
  });

  it('Files: uploadFile success + non-json, uploadFileWithProgress and avatar flows', async () => {
    // uploadFile - json
    vi.mocked(apiFetch).mockResolvedValueOnce({ status: 200, json: { filename: 'u' } });
    const fakeFile = new File(['x'], 'f.txt');
    const up = await Files.uploadFile(fakeFile as any);
    expect(up.url).toBe('u');

    // uploadFile - non-json
    vi.mocked(apiFetch).mockResolvedValueOnce({ status: 500, text: 'not-json' });
    const up2 = await Files.uploadFile(fakeFile as any);
    expect((up2 as any).text).toBe('not-json');

    // uploadFileWithProgress - mock XHR
    class MockXhr {
      readyState = 0;
      status = 200;
      responseText = JSON.stringify({ url: 'ux' });
      upload: any = {};
      onreadystatechange: any = null;
      onerror: any = null;
      open() {}
      send() {
        // simulate progress
        this.upload.onprogress && this.upload.onprogress({ lengthComputable: true, loaded: 50, total: 100 });
        this.readyState = 4;
        this.onreadystatechange && this.onreadystatechange();
      }
    }
    (globalThis as any).XMLHttpRequest = MockXhr as any;
    const progressCalls: number[] = [];
    const res = await Files.uploadFileWithProgress(fakeFile as any, (p) => progressCalls.push(p));
    expect(progressCalls).toContain(50);
    expect(res.status).toBe(200);

    // uploadAvatar: ensure uploadFile returns a url
    vi.mocked(apiFetch).mockResolvedValueOnce({ status: 200, json: { filename: 'u' } });
    vi.mocked(apiFetch).mockResolvedValueOnce({ status: 200, json: { ok: true } });
    const av = await Files.uploadAvatar(fakeFile as any);
    expect(vi.mocked(apiFetch).mock.calls.some((c: any) => c[0] === '/api/me/avatar')).toBeTruthy();

    vi.mocked(apiFetch).mockResolvedValueOnce({ status: 200, json: { ok: true } });
    await Files.deleteAvatar();
  });

  it('Alter: fetch and CRUD style calls and error paths', async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce({ status: 200, json: { items: [{ id: 1 }] } });
    const bysys = await Alter.fetchAltersBySystem('uid');
    expect((bysys as any)[0].id).toBe(1);

    vi.mocked(apiFetch).mockResolvedValueOnce({ status: 500, json: null });
    const err = await Alter.fetchAltersBySystem('uid2');
    expect((err as any).status).toBeDefined();

    vi.mocked(apiFetch).mockResolvedValueOnce({ status: 200, json: { items: [] } });
    await Alter.fetchAltersSearch('u', 'q');

    vi.mocked(apiFetch).mockResolvedValueOnce({ status: 200, json: { items: [] } });
    await Alter.fetchAlters('');

    vi.mocked(apiFetch).mockResolvedValueOnce({ status: 200, json: { id: 5 } });
    await Alter.getAlter(5);

    vi.mocked(apiFetch).mockResolvedValueOnce({ status: 201 });
    await Alter.createAlter({});

    vi.mocked(apiFetch).mockResolvedValueOnce({ status: 200 });
    await Alter.updateAlter(6, {});

    vi.mocked(apiFetch).mockResolvedValueOnce({ status: 204 });
    await Alter.deleteAlter(7);

    vi.mocked(apiFetch).mockResolvedValueOnce({ status: 200, json: { ok: true } });
    await Alter.deleteAlterImage(8, 'u');

    vi.mocked(apiFetch).mockResolvedValueOnce({ status: 200, json: { items: [] } });
    await Alter.fetchAlterNames('q');
  });
});
