import { renderHook, act } from '@testing-library/react';
import { vi } from 'vitest';
import { useDialogStates } from '../useDialogStates';

describe('useDialogStates', () => {
  it('should initialize with default closed states', () => {
    const { result } = renderHook(() => useDialogStates());

    expect(result.current.editingAlter).toBeNull();
    expect(result.current.editOpen).toBe(false);
    expect(result.current.editingGroup).toBeNull();
    expect(result.current.editGroupOpen).toBe(false);
    expect(result.current.createOpen).toBe(false);
    expect(result.current.createGroupOpen).toBe(false);
    expect(result.current.createSubsystemOpen).toBe(false);
    expect(result.current.deleteDialog).toEqual({
      open: false,
      type: null,
      id: null,
      label: ''
    });
  });

  it('should allow setting editing alter state', () => {
    const { result } = renderHook(() => useDialogStates());

    act(() => {
      result.current.setEditingAlter(123);
      result.current.setEditOpen(true);
    });

    expect(result.current.editingAlter).toBe(123);
    expect(result.current.editOpen).toBe(true);
  });

  it('should allow setting editing group state', () => {
    const { result } = renderHook(() => useDialogStates());
    const mockGroup = { id: 1, name: 'Test Group' };

    act(() => {
      result.current.setEditingGroup(mockGroup);
      result.current.setEditGroupOpen(true);
    });

    expect(result.current.editingGroup).toEqual(mockGroup);
    expect(result.current.editGroupOpen).toBe(true);
  });

  it('should allow setting create dialog states', () => {
    const { result } = renderHook(() => useDialogStates());

    act(() => {
      result.current.setCreateOpen(true);
      result.current.setCreateGroupOpen(true);
      result.current.setCreateSubsystemOpen(true);
    });

    expect(result.current.createOpen).toBe(true);
    expect(result.current.createGroupOpen).toBe(true);
    expect(result.current.createSubsystemOpen).toBe(true);
  });

  it('should allow setting delete dialog state', () => {
    const { result } = renderHook(() => useDialogStates());

    const deleteState = {
      open: true,
      type: 'alter' as const,
      id: 456,
      label: 'Test Alter'
    };

    act(() => {
      result.current.setDeleteDialog(deleteState);
    });

    expect(result.current.deleteDialog).toEqual(deleteState);
  });

  it('should allow resetting delete dialog to closed state', () => {
    const { result } = renderHook(() => useDialogStates());

    // First set it open
    act(() => {
      result.current.setDeleteDialog({
        open: true,
        type: 'group',
        id: 789,
        label: 'Test Group'
      });
    });

    expect(result.current.deleteDialog.open).toBe(true);

    // Then reset to closed
    act(() => {
      result.current.setDeleteDialog({
        open: false,
        type: null,
        id: null,
        label: ''
      });
    });

    expect(result.current.deleteDialog).toEqual({
      open: false,
      type: null,
      id: null,
      label: ''
    });
  });

  it('should handle string IDs for alters', () => {
    const { result } = renderHook(() => useDialogStates());

    act(() => {
      result.current.setEditingAlter('alter-uuid');
    });

    expect(result.current.editingAlter).toBe('alter-uuid');
  });

  it('should handle different delete dialog types', () => {
    const { result } = renderHook(() => useDialogStates());

    const testCases = [
      { type: 'alter' as const, id: 1, label: 'Alter 1' },
      { type: 'group' as const, id: 2, label: 'Group 2' },
      { type: 'subsystem' as const, id: 3, label: 'Subsystem 3' }
    ];

    testCases.forEach(({ type, id, label }) => {
      act(() => {
        result.current.setDeleteDialog({
          open: true,
          type,
          id,
          label
        });
      });

      expect(result.current.deleteDialog).toEqual({
        open: true,
        type,
        id,
        label
      });
    });
  });

  it('should maintain independent state for all dialogs', () => {
    const { result } = renderHook(() => useDialogStates());

    act(() => {
      // Open multiple dialogs simultaneously
      result.current.setEditOpen(true);
      result.current.setCreateGroupOpen(true);
      result.current.setDeleteDialog({
        open: true,
        type: 'alter',
        id: 999,
        label: 'Test'
      });
    });

    expect(result.current.editOpen).toBe(true);
    expect(result.current.createGroupOpen).toBe(true);
    expect(result.current.deleteDialog.open).toBe(true);
    expect(result.current.createOpen).toBe(false); // Should remain closed
    expect(result.current.editGroupOpen).toBe(false); // Should remain closed
  });
});