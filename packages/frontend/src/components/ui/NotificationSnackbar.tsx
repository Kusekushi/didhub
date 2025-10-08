import React from 'react';
import { Snackbar, Alert } from '@mui/material';

/**
 * Type for snackbar severity levels
 */
export type SnackbarSeverity = 'success' | 'error' | 'info' | 'warning';

export interface NotificationSnackbarProps {
  open: boolean;
  message: string;
  severity: SnackbarSeverity;
  onClose: () => void;
}

/**
 * Type for snackbar messages without the onClose handler
 * Used for setSnack callbacks throughout the application
 */
export type SnackbarMessage = Omit<NotificationSnackbarProps, 'onClose'>;

export default function NotificationSnackbar(props: NotificationSnackbarProps) {
  return (
    <Snackbar open={props.open} autoHideDuration={4000} onClose={props.onClose}>
      <Alert onClose={props.onClose} severity={props.severity} sx={{ width: '100%' }}>
        {props.message}
      </Alert>
    </Snackbar>
  );
}
