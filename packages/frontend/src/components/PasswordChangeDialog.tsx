import React from 'react';
import { Button, Dialog, DialogTitle, DialogContent, TextField } from '@mui/material';

interface PasswordChangeDialogProps {
  open: boolean;
  currentPassword: string;
  setCurrentPassword: (password: string) => void;
  newPassword: string;
  setNewPassword: (password: string) => void;
  error: string | null;
  onChange: () => void;
}

/**
 * Password change required dialog
 */
export default function PasswordChangeDialog({
  open,
  currentPassword,
  setCurrentPassword,
  newPassword,
  setNewPassword,
  error,
  onChange,
}: PasswordChangeDialogProps) {
  return (
    <Dialog open={open} disableEscapeKeyDown onClose={() => {}}>
      <DialogTitle>Password change required</DialogTitle>
      <DialogContent>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 360 }}>
          <TextField
            label="Current password"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />
          <TextField
            label="New password"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
          {error && <div style={{ color: 'red' }}>{String(error)}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button variant="contained" onClick={onChange}>
              Change password
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}