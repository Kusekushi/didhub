import { ChangeEvent, DragEvent, FormEvent, SyntheticEvent } from 'react';
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
import { apiClient } from '@didhub/api-client';
import type { Alter, Group } from '@didhub/api-client';

const { groups } = apiClient;
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

const parseLeaderIds = (leaders: Group['leaders'] | string | null | undefined): number[] => {
  const attemptParse = (value: unknown): number | undefined => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const trimmed = value.trim().replace(/^#/u, '');
      if (!trimmed) return undefined;
      const numeric = Number(trimmed);
      return Number.isFinite(numeric) ? numeric : undefined;
    }
    if (value && typeof value === 'object' && 'id' in (value as Record<string, unknown>)) {
      return attemptParse((value as { id?: unknown }).id);
    }
    return undefined;
  };

  const fromArray = (arr: unknown[]): number[] => {
    const seen = new Set<number>();
    const result: number[] = [];
    arr.forEach((entry) => {
      const numeric = attemptParse(entry);
      if (typeof numeric === 'number' && !seen.has(numeric)) {
        seen.add(numeric);
        result.push(numeric);
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

const toAlterOption = (id: number, options: Alter[]): Alter => {
  const match = options.find((option) => Number(option.id) === Number(id));
  if (match) return match;
  return { id, name: `#${id}` } as Alter;
};

const getLeadersFromGroup = (group: Group | null, options: Alter[]): Alter[] => {
  if (!group) return [];
  return parseLeaderIds(group.leaders).map((id) => toAlterOption(id, options));
};

const mapLeadersToIds = (leaders: Array<Alter | string | number>): number[] => {
  const seen = new Set<number>();
  const result: number[] = [];
  leaders.forEach((leader) => {
    const raw = typeof leader === 'object' ? (leader as Alter).id : leader;
    let numeric: number | null = null;
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      numeric = raw;
    } else if (typeof raw === 'string') {
      const trimmed = raw.trim().replace(/^#/u, '');
      const parsed = Number(trimmed);
      if (Number.isFinite(parsed)) numeric = parsed;
    }
    if (numeric != null && !seen.has(numeric)) {
      seen.add(numeric);
      result.push(numeric);
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
  const altersOptions = props.altersOptions ?? [];
  const editingGroup = isCreate ? null : (props.editingGroup ?? null);

  const leaderValue: Alter[] = isCreate
    ? (props.newGroupLeaders ?? [])
    : getLeadersFromGroup(editingGroup, altersOptions);
  const sigilUrl = isCreate ? (props.newGroupSigilUrl ?? null) : getSigilUrlFromGroup(editingGroup);
  const sigilUploading = isCreate ? props.newGroupSigilUploading : props.editingGroupSigilUploading;
  const sigilDrag = isCreate ? props.newGroupSigilDrag : props.editingGroupSigilDrag;

  const updateEditingGroup = (updater: (group: Group) => Group) => {
    if (isCreate || !props.setEditingGroup || !props.editingGroup) return;
    props.setEditingGroup(updater(props.editingGroup));
  };

  const handleClose = () => {
    if (!isCreate) props.setEditingGroup?.(null);
    props.onClose();
  };

  const handleNameChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    if (isCreate) {
      props.setNewGroupName?.(value);
    } else {
      updateEditingGroup((group) => ({ ...group, name: value }));
    }
  };

  const handleDescriptionChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    if (isCreate) {
      props.setNewGroupDesc?.(value);
    } else {
      updateEditingGroup((group) => ({ ...group, description: value }));
    }
  };

  const handleLeaderChange = (_event: SyntheticEvent, value: Alter[]) => {
    if (isCreate) {
      props.setNewGroupLeaders?.(value);
    } else {
      updateEditingGroup((group) => ({ ...group, leaders: mapLeadersToIds(value) }));
    }
  };

  const handleLeaderInputChange = (_event: SyntheticEvent, value: string) => {
    props.setLeaderQuery?.(value);
  };

  const setSigilDragState = (value: boolean) => {
    if (isCreate) props.setNewGroupSigilDrag?.(value);
    else props.setEditingGroupSigilDrag?.(value);
  };

  const setSigilUploadingState = (value: boolean) => {
    if (isCreate) props.setNewGroupSigilUploading?.(value);
    else props.setEditingGroupSigilUploading?.(value);
  };

  const setSigilUrlState = (value: string | null) => {
    if (isCreate) {
      props.setNewGroupSigilUrl?.(value);
    } else if (props.editingGroup) {
      updateEditingGroup((group) => ({ ...group, sigil: value ?? undefined }));
    }
  };

  const handleSigilRemove = () => {
    if (isCreate) {
      props.setNewGroupSigilUrl?.(null);
      props.setNewGroupSigilFiles?.([]);
    } else {
      updateEditingGroup((group) => ({ ...group, sigil: undefined }));
    }
  };

  const processSigilFile = async (file: File) => {
    if (!isCreate && !props.editingGroup) return;
    if (isCreate) props.setNewGroupSigilFiles?.([file]);

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
      const trimmedName = (props.newGroupName || '').trim();
      if (!trimmedName) {
        props.setSnack({ open: true, message: 'Name required', severity: 'error' });
        return;
      }

      if (sigilUploading) {
        props.setSnack({
          open: true,
          message: 'Please wait for sigil upload to finish',
          severity: 'error',
        });
        return;
      }

      try {
        await groups.create({
          name: trimmedName,
          description: props.newGroupDesc || null,
          sigil: sigilUrl,
          leaders: mapLeadersToIds(props.newGroupLeaders || []),
        });

        await props.refreshGroups();
        props.setSnack({ open: true, message: 'Group created', severity: 'success' });

        props.setNewGroupName?.('');
        props.setNewGroupDesc?.('');
        props.setNewGroupLeaders?.([]);
        props.setNewGroupSigilFiles?.([]);
        props.setNewGroupSigilUrl?.(null);
        props.onClose();
      } catch (error) {
        props.setSnack({ open: true, message: String(error || 'create failed'), severity: 'error' });
      }
      return;
    }

    const group = props.editingGroup;
    if (!group) return;

    if (sigilUploading) {
      props.setSnack({
        open: true,
        message: 'Please wait for sigil upload to finish',
        severity: 'error',
      });
      return;
    }

    try {
      const leadersPayload = mapLeadersToIds(leaderValue);
      await groups.update(group.id!, {
        name: group.name,
        description: group.description,
        sigil: getSigilUrlFromGroup(group),
        leaders: leadersPayload,
      });

      props.onClose();
      props.setEditingGroup?.(null);
      await props.refreshGroups();
      props.setSnack({ open: true, message: 'Group updated', severity: 'success' });
    } catch (error) {
      props.setSnack({ open: true, message: String(error || 'update failed'), severity: 'error' });
    }
  };

  const shouldRenderForm = isCreate || Boolean(editingGroup);

  return (
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
              value={isCreate ? props.newGroupName : editingGroup?.name || ''}
              onChange={handleNameChange}
              sx={{ minWidth: 240 }}
            />
            <TextField
              size="small"
              label="Description"
              value={isCreate ? props.newGroupDesc : editingGroup?.description || ''}
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
  );
}
