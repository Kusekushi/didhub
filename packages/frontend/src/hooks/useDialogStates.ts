import { useState } from 'react';
import { Group } from '@didhub/api-client';

/**
 * Hook to manage dialog states for DIDSystemView
 */
export function useDialogStates() {
  const [editingAlter, setEditingAlter] = useState<number | string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<Group | null>(null);
  const [editGroupOpen, setEditGroupOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [createSubsystemOpen, setCreateSubsystemOpen] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean;
    type?: 'alter' | 'group' | 'subsystem' | null;
    id?: number | string | null;
    label?: string;
  }>({ open: false, type: null, id: null, label: '' });

  return {
    editingAlter,
    setEditingAlter,
    editOpen,
    setEditOpen,
    editingGroup,
    setEditingGroup,
    editGroupOpen,
    setEditGroupOpen,
    createOpen,
    setCreateOpen,
    createGroupOpen,
    setCreateGroupOpen,
    createSubsystemOpen,
    setCreateSubsystemOpen,
    deleteDialog,
    setDeleteDialog,
  };
}