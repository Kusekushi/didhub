import React from 'react';
import { Snackbar, Alert } from '@mui/material';

export interface NotificationSnackbarProps {
  open: boolean;
  message: string;
  severity: 'success' | 'error' | 'info' | 'warning';
  onClose: () => void;
}

export default function NotificationSnackbar(props: NotificationSnackbarProps) {
  return (
    <Snackbar open={props.open} autoHideDuration={4000} onClose={props.onClose}>
      <Alert onClose={props.onClose} severity={props.severity} sx={{ width: '100%' }}>
        {props.message}
      </Alert>
    </Snackbar>
  );
}
