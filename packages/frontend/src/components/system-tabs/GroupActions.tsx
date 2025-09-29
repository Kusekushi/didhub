import React from 'react';
import { Button, IconButton, Tooltip } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import ShareIcon from '@mui/icons-material/Share';

import { Group } from '@didhub/api-client';
import { useGroupShare } from '../../hooks/useGroupShare';

export interface GroupActionsProps {
  group: Group;
  canManage: boolean;
  settings: any;
  setEditingGroup: (group: Group | null) => void;
  setEditGroupOpen: (open: boolean) => void;
  setDeleteDialog: (dialog: {
    open: boolean;
    type: 'alter' | 'group' | 'subsystem';
    id: number | string;
    label: string;
  }) => void;
  setSnack: (snack: { open: boolean; message: string; severity: 'success' | 'error' | 'info' | 'warning' }) => void;
}

/**
 * Component for group action buttons (View, Edit, Delete, Share)
 */
export default function GroupActions(props: GroupActionsProps) {
  const nav = useNavigate();
  const { createShareLink } = useGroupShare();

  return (
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
        <Button
          variant="outlined"
          color="error"
          size="small"
          onClick={() => props.setDeleteDialog({
            open: true,
            type: 'group',
            id: props.group.id,
            label: props.group.name || 'group'
          })}
        >
          Delete
        </Button>
      )}

      <Tooltip title="Create share link and copy to clipboard">
        {props.settings.shortLinksEnabled && (
          <IconButton
            size="small"
            onClick={() => createShareLink(props.group.id, props.setSnack)}
          >
            <ShareIcon fontSize="small" />
          </IconButton>
        )}
      </Tooltip>
    </div>
  );
}