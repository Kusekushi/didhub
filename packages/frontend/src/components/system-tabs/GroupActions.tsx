import React, { useState } from 'react';
import { Button, IconButton, Tooltip } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import ShareIcon from '@mui/icons-material/Share';

import { Group } from '@didhub/api-client';
import { useGroupShare } from '../../hooks/useGroupShare';
import { SnackbarMessage } from '../NotificationSnackbar';
import ConfirmDialog from '../../components/ConfirmDialog';

export interface GroupActionsProps {
  group: Group;
  canManage: boolean;
  settings: any;
  setEditingGroup: (group: Group | null) => void;
  setEditGroupOpen: (open: boolean) => void;
  onDelete: (groupId: number | string) => Promise<void>;
  setSnack: (snack: SnackbarMessage) => void;
}

/**
 * Component for group action buttons (View, Edit, Delete, Share)
 */
export default function GroupActions(props: GroupActionsProps) {
  const nav = useNavigate();
  const { createShareLink } = useGroupShare();
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
          <Button
            variant="outlined"
            color="error"
            size="small"
            onClick={() => setDeleteConfirmOpen(true)}
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

      <ConfirmDialog
        open={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        label={props.group.name || 'group'}
        onConfirm={() => props.onDelete(props.group.id)}
      />
    </>
  );
}