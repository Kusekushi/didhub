import { renderHook, waitFor, act } from '@testing-library/react';
import { vi } from 'vitest';
import { useAltersData } from '../useAltersData';
import { fetchAltersBySystem, fetchAltersSearch } from '../../api';

vi.mock('../../api', async () => {
  const actual = await vi.importActual('../../api');
  return {
    ...actual,
    fetchAltersBySystem: vi.fn(),
    fetchAltersSearch: vi.fn(),
  };
});

describe('useAltersData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize with empty items and loading false', () => {
    const { result } = renderHook(() => useAltersData());

    expect(result.current.items).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it('should not fetch data when uid is not provided', () => {
    renderHook(() => useAltersData());

    expect(fetchAltersBySystem).not.toHaveBeenCalled();
    expect(fetchAltersSearch).not.toHaveBeenCalled();
  });

  it('should fetch initial data when uid is provided', async () => {
    const mockAlters = [
      { id: 1, name: 'Alter 1' },
      { id: 2, name: 'Alter 2' },
    ];
    (fetchAltersBySystem as any).mockResolvedValue(mockAlters);

    const { result } = renderHook(() => useAltersData('test-uid'));

    await waitFor(() => {
      expect(fetchAltersBySystem).toHaveBeenCalledWith('test-uid');
      expect(result.current.items).toEqual(mockAlters);
    });
  });

  it('should handle error responses from fetchAltersBySystem', async () => {
    const mockErrorResponse = { status: 404 };
    (fetchAltersBySystem as any).mockResolvedValue(mockErrorResponse);

    const { result } = renderHook(() => useAltersData('test-uid'));

    await waitFor(() => {
      expect(fetchAltersBySystem).toHaveBeenCalledWith('test-uid');
      expect(result.current.items).toEqual([]);
    });
  });

  it('should handle fetch errors gracefully', async () => {
    (fetchAltersBySystem as any).mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useAltersData('test-uid'));

    await waitFor(() => {
      expect(fetchAltersBySystem).toHaveBeenCalledWith('test-uid');
      expect(result.current.items).toEqual([]);
    });
  });

  it('should perform search when search term is provided', async () => {
    const mockSearchResults = [{ id: 3, name: 'Alter 3' }];
    (fetchAltersBySystem as any).mockResolvedValue([]);
    (fetchAltersSearch as any).mockResolvedValue(mockSearchResults);

    const { result } = renderHook(() => useAltersData('test-uid', 'search term'));

    // Wait for initial load
    await waitFor(() => {
      expect(fetchAltersBySystem).toHaveBeenCalledWith('test-uid');
    });

    // Wait for search (debounced)
    await waitFor(
      () => {
        expect(fetchAltersSearch).toHaveBeenCalledWith('test-uid', 'search term');
        expect(result.current.items).toEqual(mockSearchResults);
      },
      { timeout: 500 },
    );
  });

  it('should set loading to true during search', async () => {
    const mockSearchResults = [{ id: 3, name: 'Alter 3' }];
    (fetchAltersBySystem as any).mockResolvedValue([]);
    (fetchAltersSearch as any).mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve(mockSearchResults), 100);
        }),
    );

    const { result } = renderHook(() => useAltersData('test-uid', 'search'));

    // Wait for initial load
    await waitFor(() => {
      expect(fetchAltersBySystem).toHaveBeenCalledWith('test-uid');
    });

    // Check loading state during search
    await waitFor(() => {
      expect(result.current.loading).toBe(true);
    });

    // Wait for search to complete
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.items).toEqual(mockSearchResults);
    });
  });

  it('should handle search errors gracefully', async () => {
    (fetchAltersBySystem as any).mockResolvedValue([]);
    (fetchAltersSearch as any).mockRejectedValue(new Error('Search failed'));

    const { result } = renderHook(() => useAltersData('test-uid', 'search'));

    // Wait for initial load
    await waitFor(() => {
      expect(fetchAltersBySystem).toHaveBeenCalledWith('test-uid');
    });

    // Search should complete without throwing
    await waitFor(() => {
      expect(fetchAltersSearch).toHaveBeenCalledWith('test-uid', 'search');
    });

    // Items should remain from initial load (empty in this case)
    expect(result.current.items).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it('should handle search error responses', async () => {
    const mockErrorResponse = { status: 400 };
    (fetchAltersBySystem as any).mockResolvedValue([]);
    (fetchAltersSearch as any).mockResolvedValue(mockErrorResponse);

    const { result } = renderHook(() => useAltersData('test-uid', 'search'));

    // Wait for initial load
    await waitFor(() => {
      expect(fetchAltersBySystem).toHaveBeenCalledWith('test-uid');
    });

    // Wait for search
    await waitFor(() => {
      expect(fetchAltersSearch).toHaveBeenCalledWith('test-uid', 'search');
      expect(result.current.items).toEqual([]);
    });
  });

  it('should refresh data using current search term', async () => {
    const initialData = [{ id: 1, name: 'Alter 1' }];
    const refreshData = [{ id: 2, name: 'Alter 2' }];

    (fetchAltersBySystem as any).mockResolvedValue(initialData);
    (fetchAltersSearch as any).mockResolvedValue(refreshData);

    const { result } = renderHook(() => useAltersData('test-uid', 'search term'));

    // Wait for initial setup
    await waitFor(() => {
      expect(result.current.items).toEqual(refreshData); // Should be search results
    });

    // Mock refresh call
    (fetchAltersSearch as any).mockResolvedValue([{ id: 3, name: 'Refreshed Alter' }]);

    await act(async () => {
      await result.current.refresh();
    });

    expect(fetchAltersSearch).toHaveBeenCalledWith('test-uid', 'search term');
    expect(result.current.items).toEqual([{ id: 3, name: 'Refreshed Alter' }]);
  });

  it('should not refresh when uid is not provided', async () => {
    const { result } = renderHook(() => useAltersData());

    await act(async () => {
      await result.current.refresh();
    });

    expect(fetchAltersSearch).not.toHaveBeenCalled();
  });

  it('should cancel previous search when search term changes quickly', async () => {
    (fetchAltersBySystem as any).mockResolvedValue([]);
    (fetchAltersSearch as any).mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve([{ id: 1, name: 'Slow Result' }]), 200);
        }),
    );

    const { result, rerender } = renderHook(({ search }) => useAltersData('test-uid', search), {
      initialProps: { search: 'first' },
    });

    // Wait for initial load
    await waitFor(() => {
      expect(fetchAltersBySystem).toHaveBeenCalledWith('test-uid');
    });

    // Change search term quickly
    rerender({ search: 'second' });

    // The first search should be cancelled, second should be called
    await waitFor(() => {
      expect(fetchAltersSearch).toHaveBeenCalledWith('test-uid', 'second');
    });
  });
});
