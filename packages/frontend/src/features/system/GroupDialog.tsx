import { ChangeEvent, DragEvent, FormEvent, SyntheticEvent, useState, useEffect } from 'react';
import {
  Autocomplete,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Typography,
} from '@mui/material';
// Avoid importing runtime types from generated client during this migration sweep
import type { AlterModel as Alter } from '../../types/ui';
type Group = any;
import { createGroup, updateGroup } from '../../services/groupService';
import { normalizeEntityId } from '../../shared/utils/alterFormUtils';

// Use adapter services instead of calling the generated client directly
import SigilUpload from '../../components/forms/SigilUpload';
import { useAuth } from '../../shared/contexts/AuthContext';
import { getEffectiveOwnerId } from '../../shared/utils/owner';
import NotificationSnackbar, { SnackbarMessage } from '../../components/ui/NotificationSnackbar';
import { useGroupCreationState } from '../../shared/hooks/useGroupCreationState';
import { useGroupEditingState } from '../../shared/hooks/useGroupEditingState';
import { useAlterOptions } from '../../shared/hooks/useAlterOptions';

export type GroupDialogMode = 'create' | 'edit';

export interface GroupDialogProps {
  mode: GroupDialogMode;
  open: boolean;
  onClose: () => void;
  uid: string | undefined;
  uploadFiles: (files: File[]) => Promise<string[]>;
  onCreated?: () => void;
  onUpdated?: () => void;
  group?: Group; // For edit mode
}

const leaderOptionLabel = (option: Alter | string | null): string => {
  if (!option) return '';
  if (typeof option === 'object') {
    const alter = option as Alter;
    if (alter.name) return alter.name;
    if (alter.id !== undefined && alter.id !== null) return `#${alter.id}`;
    return '';
  }
  return String(option);
};

const parseLeaderIds = (leaders: Group['leaders'] | string | null | undefined): string[] => {
  const fromArray = (arr: unknown[]): string[] => {
    const seen = new Set<string>();
    const result: string[] = [];
    arr.forEach((entry) => {
      const candidate =
        typeof entry === 'object' && entry != null && 'id' in (entry as Record<string, unknown>)
          ? (normalizeEntityId((entry as { id?: unknown }).id) ?? String((entry as { id?: unknown }).id))
          : String(entry);
      const normalized = candidate.trim().replace(/^#/u, '');
      if (normalized && !seen.has(normalized)) {
        seen.add(normalized);
        result.push(normalized);
      }
    });
    return result;
  };

  if (!leaders) return [];
  if (Array.isArray(leaders)) return fromArray(leaders);
  if (typeof leaders === 'string') {
    const trimmed = leaders.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return fromArray(parsed);
      } catch {
        return [];
      }
    }
    return fromArray(trimmed.split(','));
  }
  return [];
};

const toAlterOption = (id: string, options: Alter[]): Alter => {
  const match = options.find((option) => normalizeEntityId(option.id) === normalizeEntityId(id));
  if (match) return match;
  // create a synthetic Alter with a string id cast -- callers expect an object with an id and name
  return { id: id as unknown as number, name: `#${id}` } as Alter;
};

const getLeadersFromGroup = (group: Group | null, options: Alter[]): Alter[] => {
  if (!group) return [];
  return parseLeaderIds(group.leaders).map((id) => toAlterOption(id, options));
};

const mapLeadersToIds = (leaders: Array<Alter | string | number>): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];
  leaders.forEach((leader) => {
    const raw = typeof leader === 'object' ? (leader as Alter).id : leader;
    const s = String(raw ?? '')
      .trim()
      .replace(/^#/u, '');
    if (s && !seen.has(s)) {
      seen.add(s);
      result.push(s);
    }
  });
  return result;
};

const getSigilUrlFromGroup = (group: Group | null): string | null => {
  if (!group) return null;

  const sigilValue = group.sigil;
  if (!sigilValue) return null;

  if (Array.isArray(sigilValue)) {
    const first = sigilValue[0];
    return typeof first === 'string' ? first : null;
  }

  if (typeof sigilValue === 'string') {
    const trimmed = sigilValue.trim();
    if (!trimmed) return null;

    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed) && parsed.length) {
          const first = parsed[0];
          return typeof first === 'string' ? first : null;
        }
      } catch {
        return null;
      }
    }

    if (trimmed.includes(',')) {
      const first = trimmed
        .split(',')
        .map((segment) => segment.trim())
        .filter(Boolean)[0];
      return first || null;
    }

    return trimmed;
  }

  return null;
};

export default function GroupDialog(props: GroupDialogProps) {
  const isCreate = props.mode === 'create';
  const auth = useAuth();

  // Local state for snackbar
  const [snack, setSnack] = useState<SnackbarMessage>({ open: false, message: '', severity: 'success' });

  // Initialize hooks for state management
  const creationState = useGroupCreationState();
  const editingState = useGroupEditingState();
  const [editingGroup, setEditingGroup] = useState<Group | null>(props.group || null);
  const [leaderQuery, setLeaderQuery] = useState('');
  const altersOptionsResult = useAlterOptions(props.uid, leaderQuery);
  const altersOptions = altersOptionsResult.altersOptions;

  // Sync editing group when dialog opens with a group
  useEffect(() => {
    if (props.open && props.group && props.mode === 'edit') {
      setEditingGroup(props.group);
    } else if (!props.open) {
      setEditingGroup(null);
    }
  }, [props.open, props.group, props.mode]);

  const leaderValue: Alter[] = isCreate
    ? creationState.newGroupLeaders
    : getLeadersFromGroup(editingGroup, altersOptions);

  const sigilUrl = isCreate ? creationState.newGroupSigilUrl : getSigilUrlFromGroup(editingGroup);
  const sigilUploading = isCreate ? creationState.newGroupSigilUploading : editingState.editingGroupSigilUploading;
  const sigilDrag = isCreate ? creationState.newGroupSigilDrag : editingState.editingGroupSigilDrag;

  const updateEditingGroup = (updater: (group: Group) => Group) => {
    if (isCreate || !editingGroup) return;
    setEditingGroup(updater(editingGroup));
  };

  const handleClose = () => {
    if (!isCreate) setEditingGroup(null);
    props.onClose();
  };

  const handleNameChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    if (isCreate) {
      creationState.setNewGroupName(value);
    } else {
      updateEditingGroup((group) => ({ ...group, name: value }));
    }
  };

  const handleDescriptionChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    if (isCreate) {
      creationState.setNewGroupDesc(value);
    } else {
      updateEditingGroup((group) => ({ ...group, description: value }));
    }
  };

  const handleLeaderChange = (_event: SyntheticEvent, value: Alter[]) => {
    if (isCreate) {
      creationState.setNewGroupLeaders(value);
    } else {
      updateEditingGroup((group) => ({ ...group, leaders: mapLeadersToIds(value) }));
    }
  };

  const handleLeaderInputChange = (_event: SyntheticEvent, value: string) => {
    setLeaderQuery(value);
  };

  const setSigilDragState = (value: boolean) => {
    if (isCreate) creationState.setNewGroupSigilDrag(value);
    else editingState.setEditingGroupSigilDrag(value);
  };

  const setSigilUploadingState = (value: boolean) => {
    if (isCreate) creationState.setNewGroupSigilUploading(value);
    else editingState.setEditingGroupSigilUploading(value);
  };

  const setSigilUrlState = (value: string | null) => {
    if (isCreate) {
      creationState.setNewGroupSigilUrl(value);
    } else if (editingGroup) {
      updateEditingGroup((group) => ({ ...group, sigil: value ?? undefined }));
    }
  };

  const handleSigilRemove = () => {
    if (isCreate) {
      creationState.setNewGroupSigilUrl(null);
      creationState.setNewGroupSigilFiles([]);
    } else {
      updateEditingGroup((group) => ({ ...group, sigil: undefined }));
    }
  };

  const processSigilFile = async (file: File) => {
    if (!isCreate && !editingGroup) return;
    if (isCreate) creationState.setNewGroupSigilFiles([file]);

    const previewUrl = URL.createObjectURL(file);
    setSigilUrlState(previewUrl);
    setSigilUploadingState(true);

    try {
      const uploaded = await props.uploadFiles([file]);
      if (uploaded.length) setSigilUrlState(uploaded[0]);
    } finally {
      setSigilUploadingState(false);
    }
  };

  const handleDrop = async (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setSigilDragState(false);

    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    await processSigilFile(file);
  };

  const handleDragOver = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setSigilDragState(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setSigilDragState(false);
  };

  const handleFileSelect = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    await processSigilFile(file);
  };

  const handleSubmit = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();

    if (isCreate) {
      const trimmedName = (creationState.newGroupName || '').trim();
      if (!trimmedName) {
        setSnack({ open: true, message: 'Name required', severity: 'error' });
        return;
      }

      if (sigilUploading) {
        setSnack({
          open: true,
          message: 'Please wait for sigil upload to finish',
          severity: 'error',
        });
        return;
      }

      try {
        const owner = getEffectiveOwnerId(props.uid ?? undefined, auth.user?.id ?? null);
        // Debug: log owner resolution to help trace why owner_user_id may fall back to auth user
        // Remove this in a follow-up when root cause is verified.
        // eslint-disable-next-line no-console
        console.debug('[GroupDialog] create owner resolution', {
          propUid: props.uid,
          authUserId: auth.user?.id,
          owner,
        });
        const payload: Record<string, unknown> = {
          name: trimmedName,
          description: creationState.newGroupDesc || null,
          sigil: sigilUrl,
          leaders: mapLeadersToIds(creationState.newGroupLeaders || []),
        };
        if (owner) payload.owner_user_id = String(owner);
  // Debug: log final payload being sent to API
  // eslint-disable-next-line no-console
  console.debug('[GroupDialog] create payload', payload);
  await createGroup(payload as any);

        // Allow parent refresh handler to complete before closing so callers (and tests) can rely on updated data
        try {
          if (props.onCreated) await props.onCreated();
        } catch (e) {
          // ignore refresh errors
        }
        setSnack({ open: true, message: 'Group created', severity: 'success' });

        creationState.setNewGroupName('');
        creationState.setNewGroupDesc('');
        creationState.setNewGroupLeaders([]);
        creationState.setNewGroupSigilFiles([]);
        creationState.setNewGroupSigilUrl(null);
        props.onClose();
      } catch (error) {
        setSnack({ open: true, message: String(error || 'create failed'), severity: 'error' });
      }
      return;
    }

    const group = editingGroup;
    if (!group) return;

    if (sigilUploading) {
      setSnack({
        open: true,
        message: 'Please wait for sigil upload to finish',
        severity: 'error',
      });
      return;
    }

      try {
      const leadersPayload = mapLeadersToIds(leaderValue);
      await updateGroup(group.id!, {
        name: group.name,
        description: group.description,
        sigil: getSigilUrlFromGroup(group),
        leaders: leadersPayload,
      });

      props.onClose();
      setEditingGroup(null);
      if (props.onUpdated) await props.onUpdated();
      setSnack({ open: true, message: 'Group updated', severity: 'success' });
    } catch (error) {
      setSnack({ open: true, message: String(error || 'update failed'), severity: 'error' });
    }
  };

  const shouldRenderForm = isCreate || Boolean(editingGroup);

  return (
    <>
      <Dialog open={props.open} onClose={handleClose} fullWidth maxWidth={isCreate ? 'md' : 'sm'}>
        <DialogTitle>{isCreate ? 'Create group' : 'Edit group'}</DialogTitle>
        <DialogContent>
          {shouldRenderForm && (
            <Box
              component={isCreate ? 'form' : 'div'}
              onSubmit={isCreate ? handleSubmit : undefined}
              sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center', mt: 1 }}
            >
              <TextField
                size="small"
                label="Name"
                value={isCreate ? creationState.newGroupName : editingGroup?.name || ''}
                onChange={handleNameChange}
                sx={{ minWidth: 240 }}
              />
              <TextField
                size="small"
                label="Description"
                value={isCreate ? creationState.newGroupDesc : editingGroup?.description || ''}
                onChange={handleDescriptionChange}
                sx={{ minWidth: 320 }}
                multiline={!isCreate}
              />
              <Autocomplete
                multiple
                options={altersOptions}
                getOptionLabel={leaderOptionLabel}
                value={leaderValue}
                onChange={handleLeaderChange}
                onInputChange={handleLeaderInputChange}
                sx={{ minWidth: 240 }}
                renderInput={(params: Parameters<typeof TextField>[0]) => (
                  <TextField {...params} label="Leaders" size="small" />
                )}
              />
              <SigilUpload
                sigilUrl={sigilUrl}
                uploading={Boolean(sigilUploading)}
                drag={Boolean(sigilDrag)}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onFileSelect={handleFileSelect}
                onRemove={handleSigilRemove}
              />
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1 }}>
                Maximum file size: 20MB
              </Typography>
              {isCreate && (
                <Button variant="contained" type="submit">
                  Create
                </Button>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose}>Cancel</Button>
          {!isCreate && <Button onClick={() => handleSubmit()}>Save</Button>}
        </DialogActions>
      </Dialog>
      <NotificationSnackbar
        open={snack.open}
        message={snack.message}
        severity={snack.severity}
        onClose={() => setSnack((prev) => ({ ...prev, open: false }))}
      />
    </>
  );
}
