import { describe, expect, it, vi } from 'vitest';
import { GroupsApi } from '../Group';
import type { HttpClient } from '../../core/HttpClient';

describe('GroupsApi.listPaged', () => {
  it('forwards pagination and owner filters to the request', async () => {
    const request = vi.fn().mockResolvedValue({ data: { items: [], total: 0, limit: 20, offset: 0 } });
    const http = { request } as unknown as HttpClient;
    const api = new GroupsApi(http);

    await api.listPaged({ owner_user_id: 42, includeMembers: true, limit: 15, offset: 30, query: 'alpha' });

    expect(request).toHaveBeenCalledWith({
      path: '/api/groups',
      query: {
        q: 'alpha',
        fields: 'members',
        owner_user_id: '42',
        limit: '15',
        offset: '30',
      },
    });
  });
});
