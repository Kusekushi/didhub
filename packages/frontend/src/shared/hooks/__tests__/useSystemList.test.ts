import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSystemList } from '../useSystemList';

const { usersSystemsMock } = vi.hoisted(() => ({
  usersSystemsMock: vi.fn(),
}));

vi.mock('@didhub/api-client', () => ({
  apiClient: {
    users: {
      systems: usersSystemsMock,
    },
  },
}));

describe('useSystemList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usersSystemsMock.mockReset();
  });

  it('should initialize with empty systems and query', () => {
    const { result } = renderHook(() => useSystemList());

    expect(result.current.systems).toEqual([]);
    expect(result.current.query).toBe('');
    expect(result.current.hasQuery).toBe(false);
  });

  it('should load systems on mount', async () => {
    const mockSystems = [
      { user_id: 1, username: 'user1' },
      { user_id: 2, username: 'user2' },
    ];
    (usersSystemsMock as any).mockResolvedValue(mockSystems);

    const { result } = renderHook(() => useSystemList());

    await waitFor(() => {
      expect(usersSystemsMock).toHaveBeenCalled();
      expect(result.current.systems).toEqual(mockSystems);
    });
  });

  it('should handle load errors gracefully', async () => {
    (usersSystemsMock as any).mockRejectedValue(new Error('Load failed'));

    const { result } = renderHook(() => useSystemList());

    await waitFor(() => {
      expect(usersSystemsMock).toHaveBeenCalled();
      expect(result.current.systems).toEqual([]);
    });
  });

  it('should handle null response from usersSystemsMock', async () => {
    (usersSystemsMock as any).mockResolvedValue(null);

    const { result } = renderHook(() => useSystemList());

    await waitFor(() => {
      expect(result.current.systems).toEqual([]);
    });
  });

  it('should filter systems by username', async () => {
    const mockSystems = [
      { user_id: 1, username: 'alice' },
      { user_id: 2, username: 'bob' },
      { user_id: 3, username: 'charlie' },
    ];
    (usersSystemsMock as any).mockResolvedValue(mockSystems);

    const { result } = renderHook(() => useSystemList());

    // Wait for systems to load
    await waitFor(() => {
      expect(result.current.systems).toHaveLength(3);
    });

    // Set search query
    act(() => {
      result.current.setQuery('bob');
    });

    // Wait for debouncing and filtering
    await waitFor(
      () => {
        expect(result.current.systems).toEqual([{ user_id: 2, username: 'bob' }]);
        expect(result.current.hasQuery).toBe(true);
      },
      { timeout: 400 },
    );
  });

  it('should filter systems by user_id', async () => {
    const mockSystems = [
      { user_id: 123, username: 'alice' },
      { user_id: 456, username: 'bob' },
      { user_id: 789, username: 'charlie' },
    ];
    (usersSystemsMock as any).mockResolvedValue(mockSystems);

    const { result } = renderHook(() => useSystemList());

    await waitFor(() => {
      expect(result.current.systems).toHaveLength(3);
    });

    act(() => {
      result.current.setQuery('456');
    });

    await waitFor(
      () => {
        expect(result.current.systems).toEqual([{ user_id: 456, username: 'bob' }]);
      },
      { timeout: 400 },
    );
  });

  it('should handle case-insensitive search', async () => {
    const mockSystems = [
      { user_id: 1, username: 'Alice' },
      { user_id: 2, username: 'BOB' },
      { user_id: 3, username: 'Charlie' },
    ];
    (usersSystemsMock as any).mockResolvedValue(mockSystems);

    const { result } = renderHook(() => useSystemList());

    await waitFor(() => {
      expect(result.current.systems).toHaveLength(3);
    });

    act(() => {
      result.current.setQuery('alice');
    });

    await waitFor(
      () => {
        expect(result.current.systems).toEqual([{ user_id: 1, username: 'Alice' }]);
      },
      { timeout: 400 },
    );
  });

  it('should return all systems when query is empty', async () => {
    const mockSystems = [
      { user_id: 1, username: 'alice' },
      { user_id: 2, username: 'bob' },
    ];
    (usersSystemsMock as any).mockResolvedValue(mockSystems);

    const { result } = renderHook(() => useSystemList());

    await waitFor(() => {
      expect(result.current.systems).toHaveLength(2);
    });

    // Set and then clear query
    act(() => {
      result.current.setQuery('alice');
    });

    await waitFor(
      () => {
        expect(result.current.systems).toHaveLength(1);
      },
      { timeout: 400 },
    );

    act(() => {
      result.current.setQuery('');
    });

    await waitFor(
      () => {
        expect(result.current.systems).toHaveLength(2);
      },
      { timeout: 400 },
    );
  });

  it('should clear search using clearSearch', async () => {
    const mockSystems = [
      { user_id: 1, username: 'alice' },
      { user_id: 2, username: 'bob' },
    ];
    (usersSystemsMock as any).mockResolvedValue(mockSystems);

    const { result } = renderHook(() => useSystemList());

    await waitFor(() => {
      expect(result.current.systems).toHaveLength(2);
    });

    act(() => {
      result.current.setQuery('alice');
    });

    await waitFor(
      () => {
        expect(result.current.systems).toHaveLength(1);
        expect(result.current.hasQuery).toBe(true);
      },
      { timeout: 400 },
    );

    act(() => {
      result.current.clearSearch();
    });

    expect(result.current.query).toBe('');
    expect(result.current.hasQuery).toBe(false);

    await waitFor(
      () => {
        expect(result.current.systems).toHaveLength(2);
      },
      { timeout: 400 },
    );
  });

  it('should debounce search input', async () => {
    const mockSystems = [
      { user_id: 1, username: 'alice' },
      { user_id: 2, username: 'bob' },
    ];
    (usersSystemsMock as any).mockResolvedValue(mockSystems);

    const { result } = renderHook(() => useSystemList());

    await waitFor(() => {
      expect(result.current.systems).toHaveLength(2);
    });

    // Set query multiple times quickly
    act(() => {
      result.current.setQuery('a');
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    act(() => {
      result.current.setQuery('al');
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    act(() => {
      result.current.setQuery('ali');
    });

    // Should still show all systems during debounce period
    expect(result.current.systems).toHaveLength(2);

    // Wait for final debounce
    await waitFor(
      () => {
        expect(result.current.systems).toEqual([{ user_id: 1, username: 'alice' }]);
      },
      { timeout: 400 },
    );
  });

  it('should handle systems with missing username or user_id', async () => {
    const mockSystems = [
      { user_id: 1, username: 'alice' },
      { user_id: 2 }, // missing username
      { username: 'bob' }, // missing user_id
      {}, // missing both
    ];
    (usersSystemsMock as any).mockResolvedValue(mockSystems);

    const { result } = renderHook(() => useSystemList());

    await waitFor(() => {
      expect(result.current.systems).toHaveLength(4);
    });

    act(() => {
      result.current.setQuery('alice');
    });

    await waitFor(
      () => {
        expect(result.current.systems).toEqual([{ user_id: 1, username: 'alice' }]);
      },
      { timeout: 400 },
    );
  });
});
