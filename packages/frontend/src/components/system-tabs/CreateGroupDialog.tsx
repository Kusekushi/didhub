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
  CircularProgress,
  IconButton,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { Alter, createGroup } from '@didhub/api-client';

interface CreateGroupDialogProps {
  open: boolean;
  onClose: () => void;
  newGroupName: string;
  setNewGroupName: (name: string) => void;
  newGroupDesc: string;
  setNewGroupDesc: (desc: string) => void;
  newGroupLeaders: Alter[];
  setNewGroupLeaders: (leaders: Alter[]) => void;
  newGroupSigilFiles: File[];
  setNewGroupSigilFiles: (files: File[]) => void;
  newGroupSigilUrl: string | null;
  setNewGroupSigilUrl: (url: string | null) => void;
  newGroupSigilUploading: boolean;
  setNewGroupSigilUploading: (uploading: boolean) => void;
  newGroupSigilDrag: boolean;
  setNewGroupSigilDrag: (drag: boolean) => void;
  leaderQuery: string;
  setLeaderQuery: (query: string) => void;
  altersOptions: Alter[];
  setSnack: (snack: { open: boolean; message: string; severity: 'success' | 'error' | 'info' | 'warning' }) => void;
  refreshGroups: () => Promise<void>;
  uploadFiles: (files: File[]) => Promise<string[]>;
}

export default function CreateGroupDialog({
  open,
  onClose,
  newGroupName,
  setNewGroupName,
  newGroupDesc,
  setNewGroupDesc,
  newGroupLeaders,
  setNewGroupLeaders,
  newGroupSigilFiles,
  setNewGroupSigilFiles,
  newGroupSigilUrl,
  setNewGroupSigilUrl,
  newGroupSigilUploading,
  setNewGroupSigilUploading,
  newGroupSigilDrag,
  setNewGroupSigilDrag,
  leaderQuery,
  setLeaderQuery,
  altersOptions,
  setSnack,
  refreshGroups,
  uploadFiles,
}: CreateGroupDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>Create group</DialogTitle>
      <DialogContent>
        <Box
          component="form"
          onSubmit={async (e: React.FormEvent<HTMLFormElement>) => {
            e.preventDefault();
            if (!newGroupName || !newGroupName.trim())
              return setSnack({ open: true, message: 'Name required', severity: 'error' });
            try {
              if (newGroupSigilUploading)
                return setSnack({
                  open: true,
                  message: 'Please wait for sigil upload to finish',
                  severity: 'error',
                });
              const payload = {
                name: newGroupName.trim(),
                description: newGroupDesc || null,
                sigil: newGroupSigilUrl,
                leaders: newGroupLeaders.map((x: Alter | string | number) =>
                  typeof x === 'object' ? (x as Alter).id : x,
                ),
              };
              await createGroup(payload);
              await refreshGroups();
              setSnack({ open: true, message: 'Group created', severity: 'success' });
              setNewGroupName('');
              setNewGroupDesc('');
              setNewGroupLeaders([]);
              setNewGroupSigilFiles([]);
              setNewGroupSigilUrl(null);
              onClose();
            } catch (err) {
              setSnack({ open: true, message: String(err || 'create failed'), severity: 'error' });
            }
          }}
        >
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center', mt: 1 }}>
            <TextField
              size="small"
              label="Name"
              value={newGroupName}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewGroupName(e.target.value)}
              sx={{ minWidth: 240 }}
            />
            <TextField
              size="small"
              label="Description"
              value={newGroupDesc}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewGroupDesc(e.target.value)}
              sx={{ minWidth: 320 }}
            />
            <Autocomplete
              multiple
              options={altersOptions}
              getOptionLabel={(a: Alter | string | null) =>
                a ? (typeof a === 'object' ? (a as Alter).name || `#${(a as Alter).id}` : String(a)) : ''
              }
              value={newGroupLeaders}
              onChange={(_e: React.SyntheticEvent, v: Alter[]) => setNewGroupLeaders(v)}
              onInputChange={(_e: React.SyntheticEvent, v: string) => setLeaderQuery(v)}
              sx={{ minWidth: 240 }}
              renderInput={(params: Parameters<typeof TextField>[0]) => (
                <TextField {...params} label="Leaders" size="small" />
              )}
            />
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setNewGroupSigilDrag(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                setNewGroupSigilDrag(false);
              }}
              onDrop={async (e) => {
                e.preventDefault();
                setNewGroupSigilDrag(false);
                const file = e.dataTransfer.files && e.dataTransfer.files[0];
                if (!file) return;
                setNewGroupSigilFiles([file]);
                const localUrl = URL.createObjectURL(file);
                setNewGroupSigilUrl(localUrl); // immediate preview
                setNewGroupSigilUploading(true);
                try {
                  const uploaded = await uploadFiles([file]);
                  if (uploaded.length) setNewGroupSigilUrl(uploaded[0]);
                } finally {
                  setNewGroupSigilUploading(false);
                }
              }}
              style={{
                border: '1px dashed ' + (newGroupSigilDrag ? '#1976d2' : '#999'),
                padding: 8,
                borderRadius: 6,
                position: 'relative',
                minWidth: 140,
                minHeight: 90,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <label
                style={{
                  cursor: 'pointer',
                  width: '100%',
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'column',
                  gap: 4,
                  fontSize: 11,
                }}
              >
                {newGroupSigilUploading ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                    <CircularProgress size={26} />
                    <span>Uploading…</span>
                  </div>
                ) : newGroupSigilUrl ? (
                  <div style={{ position: 'relative' }}>
                    <img
                      src={newGroupSigilUrl}
                      alt="sigil"
                      style={{
                        maxWidth: 120,
                        maxHeight: 70,
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
                        setNewGroupSigilUrl(null);
                        setNewGroupSigilFiles([]);
                      }}
                    >
                      <CloseIcon fontSize="small" />
                    </IconButton>
                  </div>
                ) : (
                  <>
                    <span style={{ opacity: 0.8 }}>Drag & drop sigil</span>
                    <span style={{ opacity: 0.6 }}>or click to select</span>
                  </>
                )}
                <input
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={async (e: React.ChangeEvent<HTMLInputElement>) => {
                    const file = e.target.files && e.target.files[0];
                    if (!file) return;
                    setNewGroupSigilFiles([file]);
                    const localUrl = URL.createObjectURL(file);
                    setNewGroupSigilUrl(localUrl);
                    setNewGroupSigilUploading(true);
                    try {
                      const uploaded = await uploadFiles([file]);
                      if (uploaded.length) setNewGroupSigilUrl(uploaded[0]);
                    } finally {
                      setNewGroupSigilUploading(false);
                    }
                  }}
                />
              </label>
            </div>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1 }}>
              Maximum file size: 20MB
            </Typography>
            <Button variant="contained" type="submit">
              Create
            </Button>
          </Box>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
      </DialogActions>
    </Dialog>
  );
}
