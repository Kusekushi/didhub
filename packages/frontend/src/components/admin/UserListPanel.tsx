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
  type AlertColor,
} from '@mui/material';
import ConfirmDialog from '../ConfirmDialog';
import InputPromptDialog from '../InputPromptDialog';
import { apiClient, type User } from '@didhub/api-client';
import moment from 'moment';
import NotificationSnackbar from '../../components/NotificationSnackbar';

export default function UserListPanel() {
  const [users, setUsers] = useState<User[]>([]);
  const [localMsg, setLocalMsg] = useState<{ open: boolean; text: string; severity: AlertColor }>({
    open: false,
    text: '',
    severity: 'info',
  });
  const [q, setQ] = useState('');
  const [pwPromptLocal, setPwPromptLocal] = useState({ open: false, userId: null });
  const [disableConfirm, setDisableConfirm] = useState({ open: false, userId: null });
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const r = await apiClient.users.list({ query: q, page: 1, perPage: 200 });
      setUsers(r.items ?? []);
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
                    await apiClient.users.update(u.id, { is_system: !u.is_system });
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
                    await apiClient.users.update(u.id, { is_admin: !u.is_admin });
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
              secondary={`Created: ${u.created_at ? moment(u.created_at).format('MMM D, YYYY') : 'Unknown'} — System: ${u.is_system ? 'yes' : 'no'} — Admin: ${u.is_admin ? 'yes' : 'no'} — Approved: ${u.is_approved ? 'yes' : 'no'}`}
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
            const res = await apiClient.admin.resetUserPassword(pwPromptLocal.userId, value ?? '');
            if (res.success) {
              setLocalMsg({ open: true, text: res.message ?? 'Password reset', severity: 'success' });
            } else {
              setLocalMsg({ open: true, text: res.message ?? 'Failed to reset password', severity: 'error' });
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
          if (disableConfirm.userId) await apiClient.admin.disableUser(disableConfirm.userId);
          setDisableConfirm({ open: false, userId: null });
          await load();
        }}
      />
      <NotificationSnackbar
        open={localMsg.open}
        onClose={() => setLocalMsg({ ...localMsg, open: false })}
        message={localMsg.text}
        severity={localMsg.severity}
      />
    </div>
  );
}
