import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('useAlterRelationshipOptions', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('falls back to alters.list when names endpoint returns empty results', async () => {
    const mod = await import('@didhub/api-client');
    const mockNames = vi.fn().mockResolvedValue([]);
    const mockList = vi.fn().mockResolvedValue({
      items: [
        {
          id: 7,
          name: 'Alpha',
          username: 'alpha',
        },
      ],
    });
    const mockGet = vi.fn();
    (mod as any).apiClient.alters.names = mockNames;
    (mod as any).apiClient.alters.list = mockList;
    (mod as any).apiClient.alters.get = mockGet;

    const { useAlterRelationshipOptions } = await import('../../components/AlterFormDialog');
    const { result } = renderHook(() => useAlterRelationshipOptions({}));

    await act(async () => {
      await result.current.refreshPartnerOptions();
    });

    expect(mockNames).toHaveBeenCalledTimes(1);
    expect(mockList).toHaveBeenCalledWith({ perPage: 1000 });
    expect(mockGet).not.toHaveBeenCalled();

    const option = result.current.partnerOptions[0];
    expect(result.current.partnerOptions).toHaveLength(1);
    expect(option.id).toBe(7);
    expect(option.label).toBe('Alpha (@alpha) #7');

    expect(result.current.partnerMap['Alpha (@alpha) #7']).toBe(7);
    expect(result.current.partnerMap['alpha']).toBe(7);
    expect(result.current.alterIdNameMap['7']).toBe('Alpha (@alpha) #7');
  });
});
