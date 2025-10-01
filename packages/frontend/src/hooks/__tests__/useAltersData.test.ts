import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAltersData } from '../useAltersData';

const { listBySystemMock, searchMock } = vi.hoisted(() => ({
  listBySystemMock: vi.fn(),
  searchMock: vi.fn(),
}));

vi.mock('@didhub/api-client', () => ({
  apiClient: {
    alters: {
      listBySystem: listBySystemMock,
      search: searchMock,
    },
  },
}));

describe('useAltersData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listBySystemMock.mockReset();
    searchMock.mockReset();
  });

  it('returns empty items and not loading by default', () => {
    const { result } = renderHook(() => useAltersData());

    expect(result.current.items).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it('does not request data without uid', () => {
    renderHook(() => useAltersData());
    expect(listBySystemMock).not.toHaveBeenCalled();
    expect(searchMock).not.toHaveBeenCalled();
  });

  it('loads alters when uid provided', async () => {
    const alters = [{ id: 1, name: 'Alpha' }];
    listBySystemMock.mockResolvedValue(alters);

    const { result } = renderHook(() => useAltersData('uid-1'));

    await waitFor(() => {
      expect(listBySystemMock).toHaveBeenCalledWith('uid-1', { includeRelationships: true });
      expect(result.current.items).toEqual(alters);
    });
  });

  it('falls back to empty list when load fails', async () => {
    listBySystemMock.mockRejectedValue(new Error('boom'));

    const { result } = renderHook(() => useAltersData('uid-1'));

    await waitFor(() => {
      expect(listBySystemMock).toHaveBeenCalled();
      expect(result.current.items).toEqual([]);
      expect(result.current.loading).toBe(false);
    });
  });

  it('debounces search queries', async () => {
    listBySystemMock.mockResolvedValue([]);
    searchMock.mockResolvedValue([{ id: 2, name: 'Beta' }]);

    const { result } = renderHook(() => useAltersData('uid-1', 'bet'));

    await waitFor(() => {
      expect(listBySystemMock).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(searchMock).toHaveBeenCalledWith({
        userId: 'uid-1',
        query: 'bet',
        includeRelationships: true,
      });
      expect(result.current.items).toEqual([{ id: 2, name: 'Beta' }]);
    });
  });

  it('refreshes using current search criteria', async () => {
    listBySystemMock.mockResolvedValue([]);
    searchMock.mockResolvedValue([{ id: 5, name: 'Gamma' }]);

    const { result } = renderHook(() => useAltersData('uid-1', 'gamma'));

    await waitFor(() => {
      expect(result.current.items).toEqual([{ id: 5, name: 'Gamma' }]);
    });

    searchMock.mockResolvedValue([{ id: 6, name: 'Delta' }]);

    await act(async () => {
      await result.current.refresh();
    });

    expect(searchMock).toHaveBeenCalledWith({
      userId: 'uid-1',
      query: 'gamma',
      includeRelationships: true,
    });
    expect(result.current.items).toEqual([{ id: 6, name: 'Delta' }]);
  });
});
