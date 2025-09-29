import React from 'react';
import {
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Autocomplete,
  Box,
  Typography,
} from '@mui/material';
import { Alter, Group, createGroup, updateGroup } from '@didhub/api-client';
import SigilUpload from '../SigilUpload';
import { SnackbarMessage } from '../NotificationSnackbar';

export type GroupDialogMode = 'create' | 'edit';

export interface GroupDialogProps {
  mode: GroupDialogMode;
  open: boolean;
  onClose: () => void;

  // Create mode props
  newGroupName?: string;
  setNewGroupName?: (name: string) => void;
  newGroupDesc?: string;
  setNewGroupDesc?: (desc: string) => void;
  newGroupLeaders?: Alter[];
  setNewGroupLeaders?: (leaders: Alter[]) => void;
  newGroupSigilFiles?: File[];
  setNewGroupSigilFiles?: (files: File[]) => void;
  newGroupSigilUrl?: string | null;
  setNewGroupSigilUrl?: (url: string | null) => void;
  newGroupSigilUploading?: boolean;
  setNewGroupSigilUploading?: (uploading: boolean) => void;
  newGroupSigilDrag?: boolean;
  setNewGroupSigilDrag?: (drag: boolean) => void;
  leaderQuery?: string;
  setLeaderQuery?: (query: string) => void;
  altersOptions?: Alter[];

  // Edit mode props
  editingGroup?: Group | null;
  setEditingGroup?: (group: Group | null) => void;
  editingGroupSigilUploading?: boolean;
  setEditingGroupSigilUploading?: (uploading: boolean) => void;
  editingGroupSigilDrag?: boolean;
  setEditingGroupSigilDrag?: (drag: boolean) => void;

  // Common props
  setSnack: (snack: SnackbarMessage) => void;
  refreshGroups: () => Promise<void>;
  uploadFiles: (files: File[]) => Promise<string[]>;
}

export default function GroupDialog(props: GroupDialogProps) {
  const getSigilUrl = (group: Group | null): string | null => {
    if (!group) return null;
    try {
      const s = group.sigil;
      let url: string | null = null;
      if (Array.isArray(s)) url = s[0] || null;
      else if (typeof s === 'string') {
        const trimmed = s.trim();
        if (trimmed.startsWith('[')) {
          try {
            const arr = JSON.parse(trimmed);
            if (Array.isArray(arr) && arr.length) url = arr[0];
          } catch {}
        } else if (trimmed.includes(','))
          url =
            trimmed
              .split(',')
              .map((x) => x.trim())
              .filter(Boolean)[0] || null;
        else if (trimmed) url = trimmed;
      }
      return url;
    } catch {
      return null;
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (props.mode === 'create') {
      if (!props.newGroupName || !props.newGroupName.trim())
        return props.setSnack({ open: true, message: 'Name required', severity: 'error' });

      try {
        if (props.newGroupSigilUploading)
          return props.setSnack({
            open: true,
            message: 'Please wait for sigil upload to finish',
            severity: 'error',
          });

        const payload = {
          name: props.newGroupName.trim(),
          description: props.newGroupDesc || null,
          sigil: props.newGroupSigilUrl,
          leaders: props.newGroupLeaders?.map((x: Alter | string | number) =>
            typeof x === 'object' ? (x as Alter).id : x,
          ) || [],
        };

        await createGroup(payload);
        await props.refreshGroups();
        props.setSnack({ open: true, message: 'Group created', severity: 'success' });

        // Reset form
        props.setNewGroupName?.('');
        props.setNewGroupDesc?.('');
        props.setNewGroupLeaders?.([]);
        props.setNewGroupSigilFiles?.([]);
        props.setNewGroupSigilUrl?.(null);
        props.onClose();
      } catch (err) {
        props.setSnack({ open: true, message: String(err || 'create failed'), severity: 'error' });
      }
    } else {
      // Edit mode
      if (!props.editingGroup) return;

      try {
        if (props.editingGroupSigilUploading)
          return props.setSnack({ open: true, message: 'Please wait for sigil upload to finish', severity: 'error' });

        let existing: string | null = null;
        try {
          const s = props.editingGroup.sigil;
          if (Array.isArray(s)) existing = s[0] || null;
          else if (typeof s === 'string') existing = s;
        } catch {
          existing = null;
        }

        const payload = {
          name: props.editingGroup.name,
          description: props.editingGroup.description,
          sigil: existing,
          leaders: props.editingGroup.leaders || [],
        };

        await updateGroup(props.editingGroup.id, payload);
        props.onClose();
        props.setEditingGroup?.(null);
        await props.refreshGroups();
        props.setSnack({ open: true, message: 'Group updated', severity: 'success' });
      } catch (e) {
        props.setSnack({ open: true, message: String(e || 'update failed'), severity: 'error' });
      }
    }
  };

  const handleClose = () => {
    if (props.mode === 'edit') {
      props.onClose();
      props.setEditingGroup?.(null);
    } else {
      props.onClose();
    }
  };

  const renderForm = () => {
    if (props.mode === 'edit' && !props.editingGroup) return null;

    const group = props.mode === 'edit' ? props.editingGroup : null;

    return (
      <Box
        component={props.mode === 'create' ? 'form' : 'div'}
        onSubmit={props.mode === 'create' ? handleSubmit : undefined}
        sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center', mt: 1 }}
      >
        <TextField
          size="small"
          label="Name"
          value={props.mode === 'create' ? props.newGroupName : (group?.name || '')}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
            if (props.mode === 'create') {
              props.setNewGroupName?.(e.target.value);
            } else if (group && props.setEditingGroup) {
              props.setEditingGroup({ ...group, name: e.target.value });
            }
          }}
          sx={{ minWidth: 240 }}
        />
        <TextField
          size="small"
          label="Description"
          value={props.mode === 'create' ? props.newGroupDesc : (group?.description || '')}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
            if (props.mode === 'create') {
              props.setNewGroupDesc?.(e.target.value);
            } else if (group && props.setEditingGroup) {
              props.setEditingGroup({ ...group, description: e.target.value });
            }
          }}
          sx={{ minWidth: 320 }}
          multiline={props.mode === 'edit'}
        />
        {props.mode === 'create' && (
          <Autocomplete
            multiple
            options={props.altersOptions || []}
            getOptionLabel={(a: Alter | string | null) =>
              a ? (typeof a === 'object' ? (a as Alter).name || `#${(a as Alter).id}` : String(a)) : ''
            }
            value={props.newGroupLeaders || []}
            onChange={(_e: React.SyntheticEvent, v: Alter[]) => props.setNewGroupLeaders?.(v)}
            onInputChange={(_e: React.SyntheticEvent, v: string) => props.setLeaderQuery?.(v)}
            sx={{ minWidth: 240 }}
            renderInput={(params: Parameters<typeof TextField>[0]) => (
              <TextField {...params} label="Leaders" size="small" />
            )}
          />
        )}
        <SigilUpload
          sigilUrl={props.mode === 'create' ? props.newGroupSigilUrl : getSigilUrl(group)}
          uploading={props.mode === 'create' ? props.newGroupSigilUploading : props.editingGroupSigilUploading}
          drag={props.mode === 'create' ? props.newGroupSigilDrag : props.editingGroupSigilDrag}
          onDragOver={(e) => {
            e.preventDefault();
            if (props.mode === 'create') {
              props.setNewGroupSigilDrag?.(true);
            } else {
              props.setEditingGroupSigilDrag?.(true);
            }
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            if (props.mode === 'create') {
              props.setNewGroupSigilDrag?.(false);
            } else {
              props.setEditingGroupSigilDrag?.(false);
            }
          }}
          onDrop={async (e) => {
            e.preventDefault();
            if (props.mode === 'create') {
              props.setNewGroupSigilDrag?.(false);
              const file = e.dataTransfer.files && e.dataTransfer.files[0];
              if (!file) return;
              props.setNewGroupSigilFiles?.([file]);
              const localUrl = URL.createObjectURL(file);
              props.setNewGroupSigilUrl?.(localUrl);
              props.setNewGroupSigilUploading?.(true);
              try {
                const uploaded = await props.uploadFiles([file]);
                if (uploaded.length) props.setNewGroupSigilUrl?.(uploaded[0]);
              } finally {
                props.setNewGroupSigilUploading?.(false);
              }
            } else {
              props.setEditingGroupSigilDrag?.(false);
              if (!group) return;
              const file = e.dataTransfer.files && e.dataTransfer.files[0];
              if (!file) return;
              const localUrl = URL.createObjectURL(file);
              props.setEditingGroup?.({ ...group, sigil: localUrl as any });
              props.setEditingGroupSigilUploading?.(true);
              try {
                const uploaded = await props.uploadFiles([file]);
                if (uploaded.length) props.setEditingGroup?.({ ...group, sigil: uploaded[0] as any });
              } finally {
                props.setEditingGroupSigilUploading?.(false);
              }
            }
          }}
          onFileSelect={async (e: React.ChangeEvent<HTMLInputElement>) => {
            if (props.mode === 'create') {
              const file = e.target.files && e.target.files[0];
              if (!file) return;
              props.setNewGroupSigilFiles?.([file]);
              const localUrl = URL.createObjectURL(file);
              props.setNewGroupSigilUrl?.(localUrl);
              props.setNewGroupSigilUploading?.(true);
              try {
                const uploaded = await props.uploadFiles([file]);
                if (uploaded.length) props.setNewGroupSigilUrl?.(uploaded[0]);
              } finally {
                props.setNewGroupSigilUploading?.(false);
              }
            } else {
              if (!group) return;
              const file = e.target.files && e.target.files[0];
              if (!file) return;
              const localUrl = URL.createObjectURL(file);
              props.setEditingGroup?.({ ...group, sigil: localUrl as any });
              props.setEditingGroupSigilUploading?.(true);
              try {
                const uploaded = await props.uploadFiles([file]);
                if (uploaded.length) props.setEditingGroup?.({ ...group, sigil: uploaded[0] as any });
              } finally {
                props.setEditingGroupSigilUploading?.(false);
              }
            }
          }}
          onRemove={() => {
            if (props.mode === 'create') {
              props.setNewGroupSigilUrl?.(null);
              props.setNewGroupSigilFiles?.([]);
            } else {
              props.setEditingGroup?.({ ...group, sigil: null as any });
            }
          }}
        />
        <Typography variant="caption" color="text.secondary" sx={{ mt: 1 }}>
          Maximum file size: 20MB
        </Typography>
        {props.mode === 'create' && (
          <Button variant="contained" type="submit">
            Create
          </Button>
        )}
      </Box>
    );
  };

  return (
    <Dialog
      open={props.open}
      onClose={handleClose}
      fullWidth
      maxWidth={props.mode === 'create' ? 'md' : 'sm'}
    >
      <DialogTitle>{props.mode === 'create' ? 'Create group' : 'Edit group'}</DialogTitle>
      <DialogContent>
        {renderForm()}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Cancel</Button>
        {props.mode === 'edit' && (
          <Button onClick={handleSubmit}>
            Save
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}