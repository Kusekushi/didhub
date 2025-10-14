import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the alterService adapter used by the hook
const searchAltersMock = vi.fn();
vi.mock('../../../../src/services/alterService', () => ({
  searchAlters: (...args: any[]) => searchAltersMock(...args),
}))

describe('useAlterOptions', () => {
  beforeEach(() => {
    // Reset module registry so we can stub service mocks before importing the hook module
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('does not fetch when uid is not provided', async () => {
    searchAltersMock.mockResolvedValue({ items: [], total: 0 });

    const { useAlterOptions } = await import('../useAlterOptions');
    renderHook(() => useAlterOptions());

    // wait past debounce
    await new Promise((r) => setTimeout(r, 500));

    expect(searchAltersMock).not.toHaveBeenCalled();
  });

  it('does not fetch when enabled is false', async () => {
    searchAltersMock.mockResolvedValue({ items: [], total: 0 });

    const { useAlterOptions } = await import('../useAlterOptions');
    renderHook(() => useAlterOptions('system-1', '', false));

    await new Promise((r) => setTimeout(r, 500));
    expect(searchAltersMock).not.toHaveBeenCalled();
  });

  it('fetches options when uid is provided and leaderQuery set', async () => {
    const mockSearch = vi.fn().mockResolvedValue({ items: [{ id: 'a' }], total: 1, limit: 20, offset: 0 });
    searchAltersMock.mockImplementation(mockSearch as any);

    const { useAlterOptions } = await import('../useAlterOptions');
    const { result } = renderHook(() => useAlterOptions('system-1', 'query'));

    // trigger debounce
    await new Promise((r) => setTimeout(r, 350));

    await waitFor(() => {
      expect(mockSearch).toHaveBeenCalledWith({ userId: 'system-1', query: 'query', includeRelationships: true, perPage: undefined, offset: undefined } as any);
      expect(result.current.altersOptions).toEqual([{ id: 'a' }]);
    });
  });

  it('coalesces inflight identical requests across multiple hook instances', async () => {
    // Simulate a slow network call
    const mockSearch = vi.fn(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve({ items: [{ id: 'coalesced' }], total: 1, limit: 20, offset: 0 }), 100),
        ),
    );
    searchAltersMock.mockImplementation(mockSearch as any);

    const { useAlterOptions } = await import('../useAlterOptions');
    const r1 = renderHook(() => useAlterOptions('system-x', 'same'));
    const r2 = renderHook(() => useAlterOptions('system-x', 'same'));

    // trigger debounce for both and wait for the slow mock to resolve
    await new Promise((r) => setTimeout(r, 550));

    // Both renderers should have caused a single network invocation due to inflight coalescing
    expect(mockSearch).toHaveBeenCalledTimes(1);

    await waitFor(() => {
      expect(r1.result.current.altersOptions).toEqual([{ id: 'coalesced' }]);
      expect(r2.result.current.altersOptions).toEqual([{ id: 'coalesced' }]);
    });
  });
});
