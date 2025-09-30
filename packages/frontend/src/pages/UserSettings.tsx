import { useState, useEffect, useRef } from 'react';
import { Button, Avatar, Typography, TextField, type AlertColor } from '@mui/material';

import NotificationSnackbar from '../components/NotificationSnackbar';
import { useAuth } from '../contexts/AuthContext';
import {
  getMySystemRequest,
  requestSystemApproval,
  uploadAvatar,
  deleteAvatar,
  fetchMeVerified,
} from '@didhub/api-client';
import type { SystemRequest } from '../types/api';

type SnackbarState = {
  open: boolean;
  text: string;
  severity: AlertColor;
};

export default function UserSettings() {
  const { user, setUser, changePassword } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwLoading, setPwLoading] = useState(false);
  const [pwMsg, setPwMsg] = useState<SnackbarState>({ open: false, text: '', severity: 'info' });
  const [msg, setMsg] = useState<SnackbarState>({ open: false, text: '', severity: 'info' });
  const [myRequest, setMyRequest] = useState<SystemRequest | null>(null);

  async function doUpload() {
    if (!file) return;
    setLoading(true);
    const res = await uploadAvatar(file);
    setLoading(false);
    if (!res.error) {
      const me = await fetchMeVerified();
      setUser(me);
      setMsg({ open: true, text: 'Avatar updated', severity: 'success' });
    } else {
      setMsg({ open: true, text: res.message ?? 'Avatar upload failed', severity: 'error' });
    }
  }

  async function doDelete() {
    setLoading(true);
    await deleteAvatar();
    setLoading(false);
    const me = await fetchMeVerified();
    setUser(me);
  }

  async function doRefreshProfile() {
    setLoading(true);
    try {
      const me = await fetchMeVerified();
      setUser(me);
      setMsg({ open: true, text: 'Profile refreshed', severity: 'success' });
    } catch (e) {
      setMsg({ open: true, text: String(e || 'refresh failed'), severity: 'error' });
    }
    setLoading(false);
  }

  async function doChangePassword() {
    if (!currentPassword || !newPassword) {
      setPwMsg({ open: true, text: 'Current and new password required', severity: 'error' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwMsg({ open: true, text: 'New passwords do not match', severity: 'error' });
      return;
    }
    setPwLoading(true);
    try {
      const r = await changePassword(currentPassword, newPassword);
      if (r?.ok) {
        setPwMsg({ open: true, text: 'Password changed', severity: 'success' });
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        const me = await fetchMeVerified();
        setUser(me);
      } else {
        setPwMsg({ open: true, text: String(r?.error ?? 'change failed'), severity: 'error' });
      }
    } catch (e) {
      setPwMsg({ open: true, text: String(e || 'change failed'), severity: 'error' });
    }
    setPwLoading(false);
  }

  useEffect(() => {
    (async () => {
      try {
        const r = await getMySystemRequest();
        setMyRequest(r ?? null);
      } catch (e) {
        setMyRequest(null);
      }
    })();
  }, []);

  return (
    <div style={{ padding: 16 }}>
      <h2>User settings</h2>
      <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
        <Avatar src={user?.avatar ? `/uploads/${user.avatar}` : ''} sx={{ width: 64, height: 64 }} />
        <div style={{ display: 'flex', gap: 8, flexDirection: 'column' }}>
          <input
            type="file"
            accept="image/*"
            ref={fileInputRef}
            onChange={(e) => {
              const files = (e.target as HTMLInputElement).files;
              setFile(files && files.length > 0 ? files[0] : null);
            }}
            style={{ display: 'none' }}
          />
          <Button variant="outlined" onClick={() => fileInputRef.current?.click()} disabled={loading}>
            Choose avatar image
          </Button>
          {file && (
            <Typography variant="body2" color="text.secondary">
              Selected: {file.name}
            </Typography>
          )}
          <Typography variant="caption" color="text.secondary">
            Maximum file size: 10MB
          </Typography>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="contained" onClick={doUpload} disabled={!file || loading}>
              Upload avatar
            </Button>
            <Button variant="outlined" onClick={doDelete} disabled={loading}>
              Remove avatar
            </Button>
            <Button variant="outlined" onClick={doRefreshProfile} disabled={loading}>
              Refresh profile
            </Button>
          </div>
        </div>
      </div>
      <hr style={{ margin: '16px 0' }} />
      {!(user?.is_admin || user?.is_system) && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ marginBottom: 8 }}>
            {myRequest ? (
              <div>
                Request status: <strong>{myRequest.status}</strong>
                {myRequest.status === 'pending'
                  ? '  awaiting review'
                  : myRequest.status === 'approved'
                    ? '  approved'
                    : '  rejected'}
              </div>
            ) : (
              <div>No request submitted</div>
            )}
          </div>
          <Button
            variant="outlined"
            onClick={async () => {
              setLoading(true);
              try {
                const res = await requestSystemApproval();
                if (res && 'id' in res && typeof res.id !== 'undefined') {
                  const me = await fetchMeVerified();
                  setUser(me);
                  setMyRequest(res as SystemRequest);
                  setPwMsg({ open: true, text: 'System request submitted', severity: 'success' });
                } else if (res && typeof (res as { error?: unknown }).error === 'string') {
                  setPwMsg({ open: true, text: String((res as { error?: unknown }).error), severity: 'error' });
                } else {
                  setPwMsg({ open: true, text: 'Request failed', severity: 'error' });
                }
              } catch (e) {
                setPwMsg({ open: true, text: String(e || 'request failed'), severity: 'error' });
              }
              setLoading(false);
            }}
            disabled={loading || (myRequest && (myRequest.status === 'pending' || myRequest.status === 'approved'))}
          >
            Request system account
          </Button>
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 480 }}>
        <h3>Change password</h3>
        <TextField
          label="Current password"
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword((e.target as HTMLInputElement).value)}
          size="small"
        />
        <TextField
          label="New password"
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword((e.target as HTMLInputElement).value)}
          size="small"
        />
        <TextField
          label="Confirm new password"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword((e.target as HTMLInputElement).value)}
          size="small"
        />
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="contained" onClick={doChangePassword} disabled={pwLoading}>
            Change password
          </Button>
        </div>
      </div>
      <NotificationSnackbar
        open={pwMsg.open}
        onClose={() => setPwMsg({ ...pwMsg, open: false })}
        message={pwMsg.text}
        severity={pwMsg.severity}
      />
      <NotificationSnackbar
        open={msg.open}
        onClose={() => setMsg({ ...msg, open: false })}
        message={msg.text}
        severity={msg.severity}
      />
    </div>
  );
}
