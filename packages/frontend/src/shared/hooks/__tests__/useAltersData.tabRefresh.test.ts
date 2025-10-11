import { renderHook, act, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('useAltersData tab-aware refresh', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('only loads initial data when activeTab is 0 and reloads when returning to tab 0', async () => {
    const mod = await import('@didhub/api-client');

    const listMock = vi.fn().mockResolvedValue({
      data: {
        items: [{ id: 'initial' }],
        total: 1,
        limit: 20,
        offset: 0,
      },
    });
    (mod as any).apiClient.alter.get_alters = listMock;

    const { useAltersData } = await import('../useAltersData');

    // Render with activeTab = 1 (not the alters tab), uid present
    const hook1 = renderHook(({ tab }) => useAltersData('sys-1', '', tab), {
      initialProps: { tab: 1 },
    });
    const { result, rerender } = hook1;

    // Should not have called list yet
    expect(listMock).not.toHaveBeenCalled();

    // Switch to tab 0 (alters) - initial load should occur
    await act(async () => {
      rerender({ tab: 0 });
      // allow effect to run
      await new Promise((r) => setTimeout(r, 50));
    });

    await waitFor(() => {
      expect(listMock).toHaveBeenCalledWith({
        userId: 'sys-1',
        query: '',
        includeRelationships: true,
        perPage: 20,
        offset: 0,
      });
      expect(result.current.items).toEqual([{ id: 'initial' }]);
    });

    // Clear call history so we can assert the next remount triggers a new call
    listMock.mockClear();

    // Simulate leaving the tab by unmounting the hook
    hook1.unmount();

    // Remount the hook (simulate returning to the view)
    const { result: r2 } = renderHook(() => useAltersData('sys-1', '', 0));

    // allow effect to run
    await new Promise((r) => setTimeout(r, 100));

    // list should have been called once on remount
    await waitFor(() => {
      expect(listMock).toHaveBeenCalledTimes(1);
      expect(r2.current.items).toEqual([{ id: 'initial' }]);
    });
  });
});
