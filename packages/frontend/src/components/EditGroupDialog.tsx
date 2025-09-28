import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Autocomplete,
  IconButton,
  CircularProgress,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { Alter, Group } from '@didhub/api-client';

export interface EditGroupDialogProps {
  open: boolean;
  onClose: () => void;
  editingGroup: Group | null;
  setEditingGroup: (group: Group | null) => void;
  editingGroupSigilUploading: boolean;
  setEditingGroupSigilUploading: (uploading: boolean) => void;
  editingGroupSigilDrag: boolean;
  setEditingGroupSigilDrag: (dragging: boolean) => void;
  altersOptions: Alter[];
  leaderQuery: string;
  setLeaderQuery: (query: string) => void;
  uploadFiles: (files: FileList | File[] | null | undefined) => Promise<string[]>;
  updateGroup: (id: string | number, payload: any) => Promise<any>;
  refreshGroups: () => Promise<void>;
  setSnack: (snack: { open: boolean; message: string; severity: 'success' | 'error' | 'info' | 'warning' }) => void;
}

export default function EditGroupDialog(props: EditGroupDialogProps) {
  return (
    <Dialog open={props.open} onClose={props.onClose} fullWidth maxWidth="sm">
      <DialogTitle>Edit group</DialogTitle>
      <DialogContent>
        {props.editingGroup ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }}>
            <TextField
              label="Name"
              value={props.editingGroup.name || ''}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                props.setEditingGroup(props.editingGroup ? { ...props.editingGroup, name: e.target.value } : props.editingGroup)
              }
            />
            <TextField
              label="Description"
              value={props.editingGroup.description || ''}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                props.setEditingGroup(props.editingGroup ? { ...props.editingGroup, description: e.target.value } : props.editingGroup)
              }
              multiline
            />
            <div
              onDragOver={(e) => {
                e.preventDefault();
                props.setEditingGroupSigilDrag(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                props.setEditingGroupSigilDrag(false);
              }}
              onDrop={async (e) => {
                e.preventDefault();
                props.setEditingGroupSigilDrag(false);
                if (!props.editingGroup) return;
                const file = e.dataTransfer.files && e.dataTransfer.files[0];
                if (!file) return;
                const localUrl = URL.createObjectURL(file);
                props.setEditingGroup({ ...props.editingGroup, sigil: localUrl as any });
                props.setEditingGroupSigilUploading(true);
                try {
                  const uploaded = await props.uploadFiles([file]);
                  if (uploaded.length) props.setEditingGroup({ ...props.editingGroup, sigil: uploaded[0] as any });
                } finally {
                  props.setEditingGroupSigilUploading(false);
                }
              }}
              style={{
                border: '1px dashed ' + (props.editingGroupSigilDrag ? '#1976d2' : '#999'),
                padding: 10,
                borderRadius: 6,
                display: 'inline-flex',
                minWidth: 150,
                minHeight: 110,
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
              }}
            >
              <label
                style={{
                  width: '100%',
                  height: '100%',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'column',
                  gap: 6,
                  fontSize: 11,
                }}
              >
                {(function () {
                  try {
                    if (!props.editingGroup) return null;
                    const s = props.editingGroup.sigil;
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
                    if (url) {
                      return (
                        <div style={{ position: 'relative' }}>
                          <img
                            src={url}
                            alt="sigil"
                            style={{
                              maxWidth: 120,
                              maxHeight: 80,
                              objectFit: 'cover',
                              borderRadius: 4,
                              border: '1px solid #ccc',
                            }}
                          />
                          <IconButton
                            size="small"
                            sx={{ position: 'absolute', top: -10, right: -10, background: '#fff' }}
                            onClick={(e) => {
                              e.preventDefault();
                              props.setEditingGroup({ ...props.editingGroup, sigil: null as any });
                            }}
                          >
                            <CloseIcon fontSize="small" />
                          </IconButton>
                        </div>
                      );
                    }
                  } catch {}
                  return props.editingGroupSigilUploading ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                      <CircularProgress size={28} />
                      <span>Uploading…</span>
                    </div>
                  ) : (
                    <>
                      <span style={{ opacity: 0.8 }}>Drag & drop sigil</span>
                      <span style={{ opacity: 0.6 }}>or click to select</span>
                    </>
                  );
                })()}
                <input
                  id="edit-group-sigils"
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={async (e: React.ChangeEvent<HTMLInputElement>) => {
                    if (!props.editingGroup) return;
                    const file = e.target.files && e.target.files[0];
                    if (!file) return;
                    const localUrl = URL.createObjectURL(file);
                    props.setEditingGroup({ ...props.editingGroup, sigil: localUrl as any });
                    props.setEditingGroupSigilUploading(true);
                    try {
                      const uploaded = await props.uploadFiles([file]);
                      if (uploaded.length) props.setEditingGroup({ ...props.editingGroup, sigil: uploaded[0] as any });
                    } finally {
                      props.setEditingGroupSigilUploading(false);
                    }
                  }}
                />
              </label>
            </div>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1 }}>
              Maximum file size: 20MB
            </Typography>
            <Autocomplete
              multiple
              options={props.altersOptions}
              getOptionLabel={(a: any) => (a && typeof a === 'object' ? a.name || `#${a.id}` : a ? String(a) : '')}
              filterSelectedOptions
              value={(function () {
                if (!props.editingGroup) return [];
                const lv: any = props.editingGroup.leaders;
                let ids: Array<string | number> = [];
                try {
                  if (Array.isArray(lv)) {
                    ids = lv.map((x) => (typeof x === 'object' && x ? x.id : x));
                  } else if (typeof lv === 'string') {
                    const t = lv.trim();
                    if (t.startsWith('[')) {
                      try {
                        const parsed = JSON.parse(t);
                        if (Array.isArray(parsed)) ids = parsed;
                      } catch {}
                    } else {
                      ids = t
                        .split(',')
                        .map((s) => s.trim().replace(/^#[\[]?|[\]]$/g, ''))
                        .filter(Boolean);
                    }
                  }
                } catch {}
                return ids.map(
                  (id) =>
                    props.altersOptions.find((a) => String(a.id) === String(id)) || {
                      id,
                      name: `#${id}`,
                    },
                );
              })()}
              onChange={(_e: React.SyntheticEvent, v: any[]) => {
                if (!props.editingGroup) return;
                const ids = v.map((x) => (typeof x === 'object' && x ? x.id : x));
                props.setEditingGroup({ ...props.editingGroup, leaders: ids as any });
              }}
              onInputChange={(_e: React.SyntheticEvent, v: string) => props.setLeaderQuery(v)}
              renderInput={(params: Parameters<typeof TextField>[0]) => (
                <TextField {...params} label="Leaders" size="small" />
              )}
              sx={{ marginTop: 1 }}
            />
          </div>
        ) : null}
      </DialogContent>
      <DialogActions>
        <Button onClick={props.onClose}>Cancel</Button>
        <Button
          variant="contained"
          onClick={async () => {
            if (!props.editingGroup) return;
            try {
              const leaders = Array.isArray(props.editingGroup.leaders)
                ? props.editingGroup.leaders.map((x: Alter | string | number) =>
                    typeof x === 'object' && (x as Alter).id ? (x as Alter).id : x,
                  )
                : String(props.editingGroup.leaders || '')
                    .split(',')
                    .map((s: string) => s.trim())
                    .filter(Boolean);
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
                leaders,
              };
              await props.updateGroup(props.editingGroup.id, payload);
              props.onClose();
              await props.refreshGroups();
              props.setSnack({ open: true, message: 'Group updated', severity: 'success' });
            } catch (e) {
              props.setSnack({ open: true, message: String(e || 'update failed'), severity: 'error' });
            }
          }}
        >
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}
