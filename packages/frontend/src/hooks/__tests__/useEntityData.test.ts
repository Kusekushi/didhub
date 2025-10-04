import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEntityData } from '../useEntityData';

const mockFetchFunction = vi.fn();

describe('useEntityData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize with empty state when inactive', () => {
    const { result } = renderHook(() => useEntityData(1, mockFetchFunction, 'uid', '', 0));

    expect(mockFetchFunction).not.toHaveBeenCalled();
    expect(result.current.items).toEqual([]);
    expect(result.current.total).toBe(0);
    expect(result.current.loading).toBe(false);
  });

  it('should not fetch data when uid is missing', () => {
    renderHook(() => useEntityData(0, mockFetchFunction, undefined, '', 0));

    expect(mockFetchFunction).not.toHaveBeenCalled();
  });

  it('should fetch data with pagination when active', async () => {
    const mockData = [{ id: 1, name: 'Test Item' }];
    mockFetchFunction.mockResolvedValue({ items: mockData, total: 5, limit: 20, offset: 0 });

    const { result } = renderHook(() => useEntityData(0, mockFetchFunction, 'test-uid', '', 0));

    await waitFor(() => {
      expect(mockFetchFunction).toHaveBeenCalledWith({
        owner_user_id: 'test-uid',
        query: '',
        includeMembers: true,
        limit: 20,
        offset: 0,
      });
      expect(result.current.items).toEqual(mockData);
      expect(result.current.total).toBe(5);
    });
  });

  it('passes trimmed owner ids to the fetch function', async () => {
    mockFetchFunction.mockResolvedValue({ items: [], total: 0, limit: 20, offset: 0 });

    renderHook(() => useEntityData(0, mockFetchFunction, ' 42 ', '', 0));

    await waitFor(() => {
      expect(mockFetchFunction).toHaveBeenCalledWith({
        owner_user_id: '42',
        query: '',
        includeMembers: true,
        limit: 20,
        offset: 0,
      });
    });
  });

  it('should include search query in fetch request', async () => {
    const mockData = [{ id: 2, name: 'Filtered' }];
    mockFetchFunction.mockResolvedValue({ items: mockData, total: 1, limit: 20, offset: 0 });

    const { result } = renderHook(() => useEntityData(0, mockFetchFunction, 'test-uid', 'team', 0));

    await waitFor(() => {
      expect(mockFetchFunction).toHaveBeenCalledWith({
        owner_user_id: 'test-uid',
        query: 'team',
        includeMembers: true,
        limit: 20,
        offset: 0,
      });
      expect(result.current.items).toEqual(mockData);
      expect(result.current.total).toBe(1);
    });
  });

  it('should handle fetch errors gracefully', async () => {
    mockFetchFunction.mockRejectedValue(new Error('Fetch failed'));

    const { result } = renderHook(() => useEntityData(0, mockFetchFunction, 'test-uid', '', 0));

    await waitFor(() => {
      expect(mockFetchFunction).toHaveBeenCalledWith({
        owner_user_id: 'test-uid',
        query: '',
        includeMembers: true,
        limit: 20,
        offset: 0,
      });
      expect(result.current.items).toEqual([]);
      expect(result.current.total).toBe(0);
    });
  });

  it('should accept array results as fallback', async () => {
    const mockData = [{ id: 3, name: 'Array Item' }];
    mockFetchFunction.mockResolvedValue(mockData);

    const { result } = renderHook(() => useEntityData(0, mockFetchFunction, 'test-uid', '', 0));

    await waitFor(() => {
      expect(result.current.items).toEqual(mockData);
      expect(result.current.total).toBe(mockData.length);
    });
  });

  it('should refresh using the same pagination parameters', async () => {
    const mockData = [{ id: 1, name: 'Initial' }];
    const refreshed = [{ id: 2, name: 'Refreshed' }];
    mockFetchFunction
      .mockResolvedValueOnce({ items: mockData, total: 2, limit: 20, offset: 0 })
      .mockResolvedValueOnce({ items: refreshed, total: 2, limit: 20, offset: 0 });

    const { result } = renderHook(() => useEntityData(0, mockFetchFunction, 'test-uid', '', 0));

    await waitFor(() => {
      expect(result.current.items).toEqual(mockData);
    });

    await result.current.refresh();

    await waitFor(() => {
      expect(mockFetchFunction).toHaveBeenNthCalledWith(2, {
        owner_user_id: 'test-uid',
        query: '',
        includeMembers: true,
        limit: 20,
        offset: 0,
      });
      expect(result.current.items).toEqual(refreshed);
    });
  });

  it('should not refresh when uid is missing', async () => {
    const { result } = renderHook(() => useEntityData(0, mockFetchFunction, undefined, '', 0));

    await result.current.refresh();

    expect(mockFetchFunction).not.toHaveBeenCalled();
  });

  it('should refetch when search term changes', async () => {
    const first = [{ id: 1, name: 'Item 1' }];
    const second = [{ id: 2, name: 'Item 2' }];
    mockFetchFunction
      .mockResolvedValueOnce({ items: first, total: 2, limit: 20, offset: 0 })
      .mockResolvedValueOnce({ items: second, total: 2, limit: 20, offset: 0 });

    const { result, rerender } = renderHook(({ term }) => useEntityData(0, mockFetchFunction, 'test-uid', term, 0), {
      initialProps: { term: '' },
    });

    await waitFor(() => {
      expect(result.current.items).toEqual(first);
    });

    rerender({ term: 'update' });

    await waitFor(() => {
      expect(mockFetchFunction).toHaveBeenLastCalledWith({
        owner_user_id: 'test-uid',
        query: 'update',
        includeMembers: true,
        limit: 20,
        offset: 0,
      });
      expect(result.current.items).toEqual(second);
    });
  });
});
