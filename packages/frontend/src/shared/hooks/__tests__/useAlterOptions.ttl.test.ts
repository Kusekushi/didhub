import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('useAlterOptions cache TTL', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('reuses cached results for identical queries within TTL', async () => {
    const mod = await import('@didhub/api-client');

    // First call returns v1
    const mockSearch = vi.fn().mockResolvedValue({
      data: { items: [{ id: 'v1' }], total: 1, limit: 20, offset: 0 },
    });
    (mod as any).apiClient.alter.get_alters_search = mockSearch;

    const { useAlterOptions } = await import('../useAlterOptions');

    const r1 = renderHook(() => useAlterOptions('system-ttl', 'same'));

    // wait for debounce + resolution
    await new Promise((r) => setTimeout(r, 400));

    await waitFor(() => {
      expect(mockSearch).toHaveBeenCalledTimes(1);
      expect(r1.result.current.altersOptions).toEqual([{ id: 'v1' }]);
    });

    // Change the underlying mock to return v2 if called again
    mockSearch.mockResolvedValue({ data: { items: [{ id: 'v2' }], total: 1, limit: 20, offset: 0 } });

    // Create a second hook instance with the same key. Because cache TTL hasn't expired, it should use the cached v1 and not call the mock again.
    const r2 = renderHook(() => useAlterOptions('system-ttl', 'same'));

    // wait for debounce + immediate cache read to set state
    await new Promise((r) => setTimeout(r, 400));

    await waitFor(() => {
      expect(mockSearch).toHaveBeenCalledTimes(1);
      expect(r2.result.current.altersOptions).toEqual([{ id: 'v1' }]);
    });
  });
});
