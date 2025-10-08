import { renderHook, act } from '@testing-library/react';
import { useEntityCreationState } from '../useEntityCreationState';

describe('useEntityCreationState', () => {
  it('should initialize with provided initial state', () => {
    const initialState = { name: '', description: '', active: true };
    const { result } = renderHook(() => useEntityCreationState(initialState));

    expect(result.current.name).toBe('');
    expect(result.current.description).toBe('');
    expect(result.current.active).toBe(true);
  });

  it('should update a single field using updateField', () => {
    const initialState = { name: '', description: '' };
    const { result } = renderHook(() => useEntityCreationState(initialState));

    act(() => {
      result.current.updateField('name', 'New Name');
    });

    expect(result.current.name).toBe('New Name');
    expect(result.current.description).toBe(''); // unchanged
  });

  it('should update multiple fields independently', () => {
    const initialState = { name: '', description: '', count: 0 };
    const { result } = renderHook(() => useEntityCreationState(initialState));

    act(() => {
      result.current.updateField('name', 'Test Name');
    });

    act(() => {
      result.current.updateField('count', 42);
    });

    expect(result.current.name).toBe('Test Name');
    expect(result.current.description).toBe('');
    expect(result.current.count).toBe(42);
  });

  it('should reset to initial state', () => {
    const initialState = { name: '', description: '' };
    const { result } = renderHook(() => useEntityCreationState(initialState));

    act(() => {
      result.current.updateField('name', 'Modified Name');
      result.current.updateField('description', 'Modified Description');
    });

    expect(result.current.name).toBe('Modified Name');
    expect(result.current.description).toBe('Modified Description');

    act(() => {
      result.current.reset();
    });

    expect(result.current.name).toBe('');
    expect(result.current.description).toBe('');
  });

  it('should allow direct state updates with setState', () => {
    const initialState = { name: '', description: '' };
    const { result } = renderHook(() => useEntityCreationState(initialState));

    act(() => {
      result.current.setState({ name: 'Direct Update', description: 'Direct Desc' });
    });

    expect(result.current.name).toBe('Direct Update');
    expect(result.current.description).toBe('Direct Desc');
  });

  it('should work with complex object types', () => {
    interface ComplexState {
      user: { id: number; name: string };
      settings: { theme: string; notifications: boolean };
    }

    const initialState: ComplexState = {
      user: { id: 0, name: '' },
      settings: { theme: 'light', notifications: true },
    };

    const { result } = renderHook(() => useEntityCreationState(initialState));

    act(() => {
      result.current.updateField('user', { id: 123, name: 'John Doe' });
    });

    expect(result.current.user).toEqual({ id: 123, name: 'John Doe' });
    expect(result.current.settings).toEqual({ theme: 'light', notifications: true });
  });

  it('should work with array fields', () => {
    const initialState = { tags: [] as string[], categories: [] as number[] };
    const { result } = renderHook(() => useEntityCreationState(initialState));

    act(() => {
      result.current.updateField('tags', ['react', 'typescript']);
    });

    act(() => {
      result.current.updateField('categories', [1, 2, 3]);
    });

    expect(result.current.tags).toEqual(['react', 'typescript']);
    expect(result.current.categories).toEqual([1, 2, 3]);
  });

  it('should handle boolean field updates', () => {
    const initialState = { isActive: false, isPublic: true };
    const { result } = renderHook(() => useEntityCreationState(initialState));

    act(() => {
      result.current.updateField('isActive', true);
    });

    act(() => {
      result.current.updateField('isPublic', false);
    });

    expect(result.current.isActive).toBe(true);
    expect(result.current.isPublic).toBe(false);
  });

  it('should handle null and undefined values', () => {
    const initialState = { optionalField: 'initial' as string | null | undefined };
    const { result } = renderHook(() => useEntityCreationState(initialState));

    act(() => {
      result.current.updateField('optionalField', null);
    });

    expect(result.current.optionalField).toBeNull();

    act(() => {
      result.current.updateField('optionalField', undefined);
    });

    expect(result.current.optionalField).toBeUndefined();
  });
});
