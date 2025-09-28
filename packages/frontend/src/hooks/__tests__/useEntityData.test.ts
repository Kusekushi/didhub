import { renderHook, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { useEntityData } from '../useEntityData';

const mockFetchFunction = vi.fn();

describe('useEntityData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize with empty items array', () => {
    const { result } = renderHook(() =>
      useEntityData(0, mockFetchFunction, 'test-uid', '', 0)
    );

    expect(result.current.items).toEqual([]);
  });

  it('should not fetch data when activeTab does not match targetTab', () => {
    renderHook(() =>
      useEntityData(1, mockFetchFunction, 'test-uid', '', 0)
    );

    expect(mockFetchFunction).not.toHaveBeenCalled();
  });

  it('should not fetch data when uid is not provided', () => {
    renderHook(() =>
      useEntityData(0, mockFetchFunction, undefined, '', 0)
    );

    expect(mockFetchFunction).not.toHaveBeenCalled();
  });

  it('should fetch data when activeTab matches targetTab and uid is provided', async () => {
    const mockData = { items: [{ id: 1, name: 'Test Item' }] };
    mockFetchFunction.mockResolvedValue(mockData);

    const { result } = renderHook(() =>
      useEntityData(0, mockFetchFunction, 'test-uid', '', 0)
    );

    await waitFor(() => {
      expect(mockFetchFunction).toHaveBeenCalledWith('?owner_user_id=test-uid', true);
      expect(result.current.items).toEqual(mockData.items);
    });
  });

  it('should include search query in fetch request', async () => {
    const mockData = { items: [{ id: 1, name: 'Test Item' }] };
    mockFetchFunction.mockResolvedValue(mockData);

    const { result } = renderHook(() =>
      useEntityData(0, mockFetchFunction, 'test-uid', 'search term', 0)
    );

    await waitFor(() => {
      expect(mockFetchFunction).toHaveBeenCalledWith('?owner_user_id=test-uid&q=search%20term', true);
      expect(result.current.items).toEqual(mockData.items);
    });
  });

  it('should handle fetch errors gracefully', async () => {
    mockFetchFunction.mockRejectedValue(new Error('Fetch failed'));

    const { result } = renderHook(() =>
      useEntityData(0, mockFetchFunction, 'test-uid', '', 0)
    );

    await waitFor(() => {
      expect(mockFetchFunction).toHaveBeenCalledWith('?owner_user_id=test-uid', true);
    });

    // Should still have empty array after error
    expect(result.current.items).toEqual([]);
  });

  it('should handle response without items property', async () => {
    const mockData = [{ id: 1, name: 'Test Item' }];
    mockFetchFunction.mockResolvedValue(mockData);

    const { result } = renderHook(() =>
      useEntityData(0, mockFetchFunction, 'test-uid', '', 0)
    );

    await waitFor(() => {
      expect(result.current.items).toEqual(mockData);
    });
  });

  it('should refetch data when refresh is called', async () => {
    const mockData = { items: [{ id: 1, name: 'Test Item' }] };
    const refreshData = { items: [{ id: 2, name: 'Refreshed Item' }] };
    mockFetchFunction
      .mockResolvedValueOnce(mockData)
      .mockResolvedValueOnce(refreshData);

    const { result } = renderHook(() =>
      useEntityData(0, mockFetchFunction, 'test-uid', '', 0)
    );

    await waitFor(() => {
      expect(result.current.items).toEqual(mockData.items);
    });

    await result.current.refresh();

    await waitFor(() => {
      expect(mockFetchFunction).toHaveBeenCalledTimes(2);
      expect(result.current.items).toEqual(refreshData.items);
    });
  });

  it('should not refresh when uid is not provided', async () => {
    const { result } = renderHook(() =>
      useEntityData(0, mockFetchFunction, undefined, '', 0)
    );

    await result.current.refresh();

    expect(mockFetchFunction).not.toHaveBeenCalled();
  });

  it('should refetch when search term changes', async () => {
    const mockData1 = { items: [{ id: 1, name: 'Item 1' }] };
    const mockData2 = { items: [{ id: 2, name: 'Item 2' }] };
    mockFetchFunction
      .mockResolvedValueOnce(mockData1)
      .mockResolvedValueOnce(mockData2);

    const { result, rerender } = renderHook(
      ({ search }) => useEntityData(0, mockFetchFunction, 'test-uid', search, 0),
      { initialProps: { search: '' } }
    );

    await waitFor(() => {
      expect(result.current.items).toEqual(mockData1.items);
    });

    rerender({ search: 'new search' });

    await waitFor(() => {
      expect(mockFetchFunction).toHaveBeenCalledWith('?owner_user_id=test-uid&q=new%20search', true);
      expect(result.current.items).toEqual(mockData2.items);
    });
  });
});