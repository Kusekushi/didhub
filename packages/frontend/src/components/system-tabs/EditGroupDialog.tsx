import React from 'react';
import {
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  CircularProgress,
  IconButton,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { Group, updateGroup } from '@didhub/api-client';

interface EditGroupDialogProps {
  open: boolean;
  onClose: () => void;
  editingGroup: Group | null;
  setEditingGroup: (group: Group | null) => void;
  editingGroupSigilUploading: boolean;
  setEditingGroupSigilUploading: (uploading: boolean) => void;
  editingGroupSigilDrag: boolean;
  setEditingGroupSigilDrag: (drag: boolean) => void;
  setSnack: (snack: { open: boolean; message: string; severity: 'success' | 'error' | 'info' | 'warning' }) => void;
  refreshGroups: () => Promise<void>;
  uploadFiles: (files: File[]) => Promise<string[]>;
}

export default function EditGroupDialog({
  open,
  onClose,
  editingGroup,
  setEditingGroup,
  editingGroupSigilUploading,
  setEditingGroupSigilUploading,
  editingGroupSigilDrag,
  setEditingGroupSigilDrag,
  setSnack,
  refreshGroups,
  uploadFiles,
}: EditGroupDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={() => {
        onClose();
        setEditingGroup(null);
      }}
      fullWidth
      maxWidth="sm"
    >
      <DialogTitle>Edit group</DialogTitle>
      <DialogContent>
        {editingGroup ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }}>
            <TextField
              label="Name"
              value={editingGroup.name || ''}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setEditingGroup(editingGroup ? { ...editingGroup, name: e.target.value } : editingGroup)
              }
            />
            <TextField
              label="Description"
              value={editingGroup.description || ''}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setEditingGroup(editingGroup ? { ...editingGroup, description: e.target.value } : editingGroup)
              }
              multiline
            />
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setEditingGroupSigilDrag(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                setEditingGroupSigilDrag(false);
              }}
              onDrop={async (e) => {
                e.preventDefault();
                setEditingGroupSigilDrag(false);
                if (!editingGroup) return;
                const file = e.dataTransfer.files && e.dataTransfer.files[0];
                if (!file) return;
                const localUrl = URL.createObjectURL(file);
                setEditingGroup({ ...editingGroup, sigil: localUrl as any });
                setEditingGroupSigilUploading(true);
                try {
                  const uploaded = await uploadFiles([file]);
                  if (uploaded.length) setEditingGroup({ ...editingGroup, sigil: uploaded[0] as any });
                } finally {
                  setEditingGroupSigilUploading(false);
                }
              }}
              style={{
                border: '1px dashed ' + (editingGroupSigilDrag ? '#1976d2' : '#999'),
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
                    if (!editingGroup) return null;
                    const s = editingGroup.sigil;
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
                              setEditingGroup({ ...editingGroup, sigil: null as any });
                            }}
                          >
                            <CloseIcon fontSize="small" />
                          </IconButton>
                        </div>
                      );
                    }
                  } catch {}
                  return editingGroupSigilUploading ? (
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
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={async (e: React.ChangeEvent<HTMLInputElement>) => {
                    if (!editingGroup) return;
                    const file = e.target.files && e.target.files[0];
                    if (!file) return;
                    const localUrl = URL.createObjectURL(file);
                    setEditingGroup({ ...editingGroup, sigil: localUrl as any });
                    setEditingGroupSigilUploading(true);
                    try {
                      const uploaded = await uploadFiles([file]);
                      if (uploaded.length) setEditingGroup({ ...editingGroup, sigil: uploaded[0] as any });
                    } finally {
                      setEditingGroupSigilUploading(false);
                    }
                  }}
                />
              </label>
            </div>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1 }}>
              Maximum file size: 20MB
            </Typography>
          </div>
        ) : null}
      </DialogContent>
      <DialogActions>
        <Button
          onClick={async () => {
            if (!editingGroup) return;
            try {
              if (editingGroupSigilUploading)
                return setSnack({ open: true, message: 'Please wait for sigil upload to finish', severity: 'error' });
              let existing: string | null = null;
              try {
                const s = editingGroup.sigil;
                if (Array.isArray(s)) existing = s[0] || null;
                else if (typeof s === 'string') existing = s;
              } catch {
                existing = null;
              }
              const payload = {
                name: editingGroup.name,
                description: editingGroup.description,
                sigil: existing,
                leaders: editingGroup.leaders || [],
              };
              await updateGroup(editingGroup.id, payload);
              onClose();
              setEditingGroup(null);
              await refreshGroups();
              setSnack({ open: true, message: 'Group updated', severity: 'success' });
            } catch (e) {
              setSnack({ open: true, message: String(e || 'update failed'), severity: 'error' });
            }
          }}
        >
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}
