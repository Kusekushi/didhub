import { useState } from 'react';

/**
 * Hook to manage group editing state
 */
export function useGroupEditingState() {
  const [editingGroupSigilUploading, setEditingGroupSigilUploading] = useState(false);
  const [editingGroupSigilDrag, setEditingGroupSigilDrag] = useState(false);

  return {
    editingGroupSigilUploading,
    setEditingGroupSigilUploading,
    editingGroupSigilDrag,
    setEditingGroupSigilDrag,
  };
}
