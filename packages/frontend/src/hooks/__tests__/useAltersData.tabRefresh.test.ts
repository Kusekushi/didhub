import { renderHook, act, waitFor } from '@testing-library/react';
import { vi } from 'vitest';

describe('useAltersData tab-aware refresh', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('only loads initial data when activeTab is 0 and reloads when returning to tab 0', async () => {
    const mod = await import('@didhub/api-client');

    const listMock = vi.fn().mockResolvedValue([{ id: 'initial' }]);
    const searchMock = vi.fn().mockResolvedValue([{ id: 'search' }]);
    (mod as any).apiClient.alters.listBySystem = listMock;
    (mod as any).apiClient.alters.search = searchMock;

    const { useAltersData } = await import('../useAltersData');

    // Render with activeTab = 1 (not the alters tab), uid present
    const hook1 = renderHook(({ tab }) => useAltersData('sys-1', '', tab), {
      initialProps: { tab: 1 },
    });
    const { result, rerender } = hook1;

    // Should not have called listBySystem yet
    expect(listMock).not.toHaveBeenCalled();

    // Switch to tab 0 (alters) - initial load should occur
    await act(async () => {
      rerender({ tab: 0 });
      // allow effect to run
      await new Promise((r) => setTimeout(r, 50));
    });

    await waitFor(() => {
      expect(listMock).toHaveBeenCalledWith('sys-1', { includeRelationships: true });
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

    // listBySystem should have been called once on remount
    await waitFor(() => {
      expect(listMock).toHaveBeenCalledTimes(1);
      expect(r2.current.items).toEqual([{ id: 'initial' }]);
    });
  });
});
