import React, { useEffect, useState } from 'react';
import {
  Stack,
  Button,
  TextField,
  Typography,
  List,
  ListItem,
  ListItemText,
  Avatar,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControlLabel,
  Checkbox,
  type AlertColor,
} from '@mui/material';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import InputPromptDialog from '../../components/forms/InputPromptDialog';
import {
  listUsers,
  updateUser,
  resetUserPassword,
  disableUser,
  createUser,
} from '../../services/adminService';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';

dayjs.extend(utc);
import NotificationSnackbar from '../../components/ui/NotificationSnackbar';
import { ApiUser } from 'types/ui';

export default function UserListPanel() {
  const [users, setUsers] = useState<ApiUser[]>([]);
  const [localMsg, setLocalMsg] = useState<{ open: boolean; text: string; severity: AlertColor }>({
    open: false,
    text: '',
    severity: 'info',
  });
  const [q, setQ] = useState('');
  const [pwPromptLocal, setPwPromptLocal] = useState({ open: false, userId: null });
  const [disableConfirm, setDisableConfirm] = useState({ open: false, userId: null });
  const [createDialog, setCreateDialog] = useState({ open: false });
  const [createForm, setCreateForm] = useState({
    username: '',
    password: '',
    is_admin: false,
    is_system: false,
    is_approved: true,
  });
  const [createFormErrors, setCreateFormErrors] = useState<{ username?: string; password?: string }>({});
  const [loading, setLoading] = useState(false);

  function validateCreateForm() {
    const errors: { username?: string; password?: string } = {};
    if (!createForm.username.trim()) {
      errors.username = 'Username is required';
    }
    if (createForm.password.length < 8) {
      errors.password = 'Password must be at least 8 characters';
    }
    setCreateFormErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function load() {
    setLoading(true);
    try {
      const r: any = await listUsers({ q, page: 1, per_page: 200 });
      setUsers(r?.items ?? []);
    } catch (e) {
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  return (
    <div>
      <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
        <TextField placeholder="Search users" value={q} onChange={(e) => setQ(e.target.value)} />
        <Button onClick={load}>Refresh</Button>
        <Button variant="contained" onClick={() => setCreateDialog({ open: true })}>
          Create User
        </Button>
      </Stack>
      {loading && <Typography>Loading...</Typography>}
      <List>
        {users.map((u) => (
          <ListItem
            key={u.id}
            sx={{ border: '1px solid #eee', mb: 1 }}
            secondaryAction={
              <Stack direction="row" spacing={1}>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={async () => {
                    setPwPromptLocal({ open: true, userId: u.id });
                  }}
                >
                  Reset PW
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  color="error"
                  onClick={async () => {
                    setDisableConfirm({ open: true, userId: u.id });
                  }}
                >
                  Disable
                </Button>
                <Button
                  size="small"
                  variant="contained"
                  onClick={async () => {
                    await updateUser(u.id, { is_system: !u.is_system });
                    await load();
                  }}
                >
                  {u.is_system ? 'Unset system' : 'Set system'}
                </Button>
                <Button
                  size="small"
                  variant={u.is_admin ? 'contained' : 'outlined'}
                  color={u.is_admin ? 'secondary' : 'primary'}
                  onClick={async () => {
                    await updateUser(u.id, { is_admin: !u.is_admin });
                    await load();
                  }}
                >
                  {u.is_admin ? 'Revoke admin' : 'Make admin'}
                </Button>
              </Stack>
            }
          >
            <Avatar src={u.avatar ? `/uploads/${u.avatar}` : ''} sx={{ mr: 2 }} />
            <ListItemText
              primary={u.username}
              secondary={`Created: ${u.created_at ? dayjs.utc(u.created_at).format('MMM D, YYYY') : 'Unknown'} — System: ${u.is_system ? 'yes' : 'no'} — Admin: ${u.is_admin ? 'yes' : 'no'} — Approved: ${u.is_approved ? 'yes' : 'no'}`}
            />
          </ListItem>
        ))}
      </List>
      <InputPromptDialog
        open={pwPromptLocal.open}
        title="Set new password"
        label="New password"
        defaultValue=""
        onCancel={() => setPwPromptLocal({ open: false, userId: null })}
            onSubmit={async (value) => {
          try {
            if (!pwPromptLocal.userId) return;
            const res = await resetUserPassword(pwPromptLocal.userId, value ?? '');
            if ((res as any)?.success) {
              setLocalMsg({ open: true, text: (res as any).message ?? 'Password reset', severity: 'success' });
            } else {
              setLocalMsg({ open: true, text: (res as any).message ?? 'Failed to reset password', severity: 'error' });
            }
          } catch (e) {
            setLocalMsg({ open: true, text: String(e || 'Failed'), severity: 'error' });
          } finally {
            setPwPromptLocal({ open: false, userId: null });
          }
        }}
      />
      <ConfirmDialog
        open={disableConfirm.open}
        label="this user"
        onClose={() => setDisableConfirm({ open: false, userId: null })}
          onConfirm={async () => {
          if (disableConfirm.userId) await disableUser(disableConfirm.userId);
          setDisableConfirm({ open: false, userId: null });
          await load();
        }}
      />
      <Dialog open={createDialog.open} onClose={() => setCreateDialog({ open: false })}>
        <DialogTitle>Create New User</DialogTitle>
        <DialogContent>
          <form>
            <Stack spacing={2} sx={{ mt: 1 }}>
              <TextField
                label="Username"
                value={createForm.username}
                onChange={(e) => setCreateForm({ ...createForm, username: e.target.value })}
                error={!!createFormErrors.username}
                helperText={createFormErrors.username}
                fullWidth
              />
              <TextField
                label="Password"
                type="password"
                value={createForm.password}
                onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                error={!!createFormErrors.password}
                helperText={createFormErrors.password}
                fullWidth
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={createForm.is_admin}
                    onChange={(e) => setCreateForm({ ...createForm, is_admin: e.target.checked })}
                  />
                }
                label="Admin"
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={createForm.is_system}
                    onChange={(e) => setCreateForm({ ...createForm, is_system: e.target.checked })}
                  />
                }
                label="System"
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={createForm.is_approved}
                    onChange={(e) => setCreateForm({ ...createForm, is_approved: e.target.checked })}
                  />
                }
                label="Approved"
              />
            </Stack>
          </form>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setCreateDialog({ open: false });
              setCreateFormErrors({});
            }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
              onClick={async () => {
                if (!validateCreateForm()) {
                  return;
                }
                try {
                  await createUser(createForm);
                  setCreateDialog({ open: false });
                  setCreateForm({
                    username: '',
                    password: '',
                    is_admin: false,
                    is_system: false,
                    is_approved: true,
                  });
                  setCreateFormErrors({});
                  await load();
                  setLocalMsg({ open: true, text: 'User created successfully', severity: 'success' });
                } catch (e) {
                  setLocalMsg({ open: true, text: String(e || 'Failed to create user'), severity: 'error' });
                }
              }}
          >
            Create
          </Button>
        </DialogActions>
      </Dialog>
      <NotificationSnackbar
        open={localMsg.open}
        onClose={() => setLocalMsg({ ...localMsg, open: false })}
        message={localMsg.text}
        severity={localMsg.severity}
      />
    </div>
  );
}
