import React, { useState } from 'react';
import { Button } from '@mui/material';
import { useNavigate } from 'react-router-dom';

import ConfirmDialog from '../ui/ConfirmDialog';
import { ApiGroupOut } from '@didhub/api-client';

export interface GroupActionsProps {
  group: ApiGroupOut;
  canManage: boolean;
  setEditingGroup: (group: ApiGroupOut | null) => void;
  setEditGroupOpen: (open: boolean) => void;
  onDelete: (groupId: number | string) => Promise<void>;
}

/**
 * Component for group action buttons (View, Edit, Delete, Share)
 */
export default function GroupActions(props: GroupActionsProps) {
  const nav = useNavigate();
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  return (
    <>
      <div style={{ display: 'flex', gap: 8 }}>
        <Button variant="outlined" size="small" onClick={() => nav(`/groups/${props.group.id}`)}>
          View
        </Button>

        {props.canManage && (
          <Button
            variant="outlined"
            size="small"
            onClick={async () => {
              props.setEditingGroup(props.group);
              props.setEditGroupOpen(true);
            }}
          >
            Edit
          </Button>
        )}

        {props.canManage && (
          <Button variant="outlined" color="error" size="small" onClick={() => setDeleteConfirmOpen(true)}>
            Delete
          </Button>
        )}
      </div>

      <ConfirmDialog
        open={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        label={props.group.name || 'group'}
        onConfirm={() => props.onDelete(props.group.id)}
      />
    </>
  );
}
