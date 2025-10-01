import { renderHook, waitFor } from '@testing-library/react';
import { vi } from 'vitest';

describe('useAlterOptions', () => {
  beforeEach(() => {
    // Reset module registry so we can stub api-client before importing the hook module
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('does not fetch when uid is not provided', async () => {
    // stub apiClient.alters.search before importing the hook
    const mod = await import('@didhub/api-client');
    (mod as any).apiClient.alters.search = vi.fn();

    const { useAlterOptions } = await import('../useAlterOptions');
    renderHook(() => useAlterOptions());

  // wait past debounce
  await new Promise((r) => setTimeout(r, 500));

  expect((mod as any).apiClient.alters.search).not.toHaveBeenCalled();
  });

  it('does not fetch when enabled is false', async () => {
    const mod = await import('@didhub/api-client');
    (mod as any).apiClient.alters.search = vi.fn();

    const { useAlterOptions } = await import('../useAlterOptions');
    renderHook(() => useAlterOptions('system-1', '', false));

  await new Promise((r) => setTimeout(r, 500));
  expect((mod as any).apiClient.alters.search).not.toHaveBeenCalled();
  });

  it('fetches options when uid is provided and leaderQuery set', async () => {
    const mod = await import('@didhub/api-client');
    const mockSearch = vi.fn().mockResolvedValue([{ id: 'a' }]);
    (mod as any).apiClient.alters.search = mockSearch;

    const { useAlterOptions } = await import('../useAlterOptions');
    const { result } = renderHook(() => useAlterOptions('system-1', 'query'));

    // trigger debounce
    await new Promise((r) => setTimeout(r, 350));

    await waitFor(() => {
      expect(mockSearch).toHaveBeenCalledWith({ userId: 'system-1', query: 'query', includeRelationships: true });
      expect(result.current.altersOptions).toEqual([{ id: 'a' }]);
    });
  });

  it('coalesces inflight identical requests across multiple hook instances', async () => {
    const mod = await import('@didhub/api-client');
    // Simulate a slow network call
    const mockSearch = vi.fn(
      () => new Promise((resolve) => setTimeout(() => resolve([{ id: 'coalesced' }]), 100)),
    );
    (mod as any).apiClient.alters.search = mockSearch;

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
