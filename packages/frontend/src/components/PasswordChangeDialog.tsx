import React from 'react';
import { Button, Dialog, DialogTitle, DialogContent, TextField } from '@mui/material';
import { useAuth } from '../contexts/AuthContext';
import { usePasswordChange } from '../hooks/usePasswordChange';

export interface PasswordChangeDialogProps {
  open: boolean;
}

/**
 * Password change required dialog
 */
export default function PasswordChangeDialog(props: PasswordChangeDialogProps) {
  const { changePassword } = useAuth();
  const passwordChange = usePasswordChange({ changePassword });

  return (
    <Dialog open={props.open} disableEscapeKeyDown onClose={() => {}}>
      <DialogTitle>Password change required</DialogTitle>
      <DialogContent>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 360 }}>
          <TextField
            label="Current password"
            type="password"
            value={passwordChange.currentPassword}
            onChange={(e) => passwordChange.setCurrentPassword(e.target.value)}
          />
          <TextField
            label="New password"
            type="password"
            value={passwordChange.newPassword}
            onChange={(e) => passwordChange.setNewPassword(e.target.value)}
          />
          {passwordChange.error && <div style={{ color: 'red' }}>{String(passwordChange.error)}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button variant="contained" onClick={passwordChange.handleChange}>
              Change password
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
