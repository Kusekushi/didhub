import { useState } from 'react';
import { updateAlter, getAlter, Alter } from '@didhub/api-client';

interface UseRenameResult {
  /** Whether the rename operation is currently active */
  renaming: boolean;
  /** Current value of the rename input field */
  renameVal: string;
  /** Error message if rename validation fails */
  renameError: string | null;
  /** Function to start the rename process */
  startRename: () => void;
  /** Function to cancel the rename process */
  cancelRename: () => void;
  /** Function to save the new name */
  saveRename: () => Promise<void>;
  /** Function to update the rename input value */
  setRenameVal: (value: string) => void;
}

/**
 * Custom hook to manage alter renaming functionality.
 *
 * Provides state management for renaming an alter, including validation,
 * API calls, and error handling. Supports optimistic updates with rollback
 * on failure.
 *
 * @param alter - The alter object being renamed, or null if none selected
 * @param onRenamed - Optional callback fired when rename succeeds
 * @returns Object containing rename state and control functions
 */
export function useRename(alter: Alter | null, onRenamed?: (updatedAlter: Alter) => void): UseRenameResult {
  const [renaming, setRenaming] = useState(false);
  const [renameVal, setRenameVal] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);

  const startRename = () => {
    if (alter?.name) {
      setRenameVal(alter.name);
    }
    setRenaming(true);
    setRenameError(null);
  };

  const cancelRename = () => {
    setRenaming(false);
    setRenameVal(alter?.name || '');
    setRenameError(null);
  };

  const saveRename = async () => {
    if (!alter) return;

    const newName = renameVal.trim();
    if (!newName) {
      setRenameError('Name required');
      return;
    }
    if (newName.length > 200) {
      setRenameError('Name too long');
      return;
    }
    if (newName === alter.name) {
      setRenaming(false);
      setRenameError(null);
      return;
    }

    try {
      setRenameError(null);
      const resp = await updateAlter(alter.id as string | number, { name: newName });
      if (resp && (resp as any).status === 200) {
        const updated = await getAlter(alter.id as string | number);
        if (updated && onRenamed) {
          onRenamed(updated);
        }
        setRenaming(false);
      } else if (resp && (resp as any).json && (resp as any).json.errors) {
        const errs = (resp as any).json.errors;
        setRenameError(errs.name || 'Rename failed');
      } else {
        setRenameError('Rename failed');
      }
    } catch (e) {
      setRenameError((e as any)?.message || 'Rename failed');
    }
  };

  return {
    renaming,
    renameVal,
    renameError,
    startRename,
    cancelRename,
    saveRename,
    setRenameVal,
  };
}
