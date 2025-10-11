import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Alter } from '@didhub/api-client';
import { useAltersData } from '../useAltersData';

type ListParams = {
  userId?: string;
  query?: string;
  includeRelationships?: boolean;
  perPage?: number;
  offset?: number;
};

type MockPage<T> = {
  items: T[];
  total: number;
  limit: number;
  offset: number;
};

type MockResponse<T> = {
  data: T;
};

const { listMock } = vi.hoisted(() => ({
  listMock: vi.fn<(params: ListParams) => Promise<MockResponse<MockPage<Alter>>>>(),
}));

vi.mock('@didhub/api-client', () => ({
  apiClient: {
    alter: {
      get_alters: listMock,
    },
  },
}));

describe('useAltersData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listMock.mockReset();
  });

  it('returns empty items and not loading by default', () => {
    const { result } = renderHook(() => useAltersData());

    expect(result.current.items).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it('does not request data without uid', () => {
    renderHook(() => useAltersData());
    expect(listMock).not.toHaveBeenCalled();
  });

  it('loads alters when uid provided', async () => {
    const alters = [{ id: 1, name: 'Alpha' }];
    listMock.mockResolvedValue({ data: { items: alters, total: 3, limit: 20, offset: 0 } });

    const { result } = renderHook(() => useAltersData('uid-1'));

    await waitFor(() => {
      expect(listMock).toHaveBeenCalledWith({
        userId: 'uid-1',
        query: '',
        includeRelationships: true,
        perPage: 20,
        offset: 0,
      });
      expect(result.current.items).toEqual(alters);
      expect(result.current.total).toBe(3);
    });
  });

  it('falls back to empty list when load fails', async () => {
    listMock.mockRejectedValue(new Error('boom'));

    const { result } = renderHook(() => useAltersData('uid-1'));

    await waitFor(() => {
      expect(listMock).toHaveBeenCalled();
      expect(result.current.items).toEqual([]);
      expect(result.current.loading).toBe(false);
    });
  });

  it('includes search query when fetching', async () => {
    const alters = [{ id: 2, name: 'Beta' }];
    listMock.mockResolvedValue({ data: { items: alters, total: 1, limit: 20, offset: 0 } });

    const { result } = renderHook(() => useAltersData('uid-1', 'bet'));

    await waitFor(() => {
      expect(listMock).toHaveBeenCalledWith({
        userId: 'uid-1',
        query: 'bet',
        includeRelationships: true,
        perPage: 20,
        offset: 0,
      });
      expect(result.current.items).toEqual(alters);
      expect(result.current.total).toBe(1);
    });
  });

  it('refreshes using current pagination parameters', async () => {
    const first: MockPage<Alter> = { items: [{ id: 5, name: 'Gamma' }], total: 5, limit: 20, offset: 0 };
    const second: MockPage<Alter> = { items: [{ id: 6, name: 'Delta' }], total: 5, limit: 20, offset: 0 };
    listMock.mockResolvedValueOnce({ data: first }).mockResolvedValueOnce({ data: second });

    const { result } = renderHook(() => useAltersData('uid-1', 'gamma'));

    await waitFor(() => {
      expect(result.current.items).toEqual(first.items);
    });

    await act(async () => {
      await result.current.refresh();
    });

    expect(listMock).toHaveBeenLastCalledWith({
      userId: 'uid-1',
      query: 'gamma',
      includeRelationships: true,
      perPage: 20,
      offset: 0,
    });
    expect(result.current.items).toEqual(second.items);
  });

  it('requests subsequent pages with computed offset', async () => {
    listMock.mockResolvedValue({ data: { items: [{ id: 9 }], total: 25, limit: 10, offset: 20 } });

    renderHook(() => useAltersData('uid-9', '', 0, 2, 10));

    await waitFor(() => {
      expect(listMock).toHaveBeenCalledWith({
        userId: 'uid-9',
        query: '',
        includeRelationships: true,
        perPage: 10,
        offset: 20,
      });
    });
  });
});
