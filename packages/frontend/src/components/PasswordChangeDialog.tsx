import React from 'react';
import { Button, Dialog, DialogTitle, DialogContent, TextField } from '@mui/material';

export interface PasswordChangeDialogProps {
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
export default function PasswordChangeDialog(props: PasswordChangeDialogProps) {
  return (
    <Dialog open={props.open} disableEscapeKeyDown onClose={() => {}}>
      <DialogTitle>Password change required</DialogTitle>
      <DialogContent>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 360 }}>
          <TextField
            label="Current password"
            type="password"
            value={props.currentPassword}
            onChange={(e) => props.setCurrentPassword(e.target.value)}
          />
          <TextField
            label="New password"
            type="password"
            value={props.newPassword}
            onChange={(e) => props.setNewPassword(e.target.value)}
          />
          {props.error && <div style={{ color: 'red' }}>{String(props.error)}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button variant="contained" onClick={props.onChange}>
              Change password
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
