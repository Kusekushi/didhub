import React from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button } from '@mui/material';

export interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  label?: string;
  onConfirm: () => void | Promise<void>;
  confirmLabel?: string;
  cancelLabel?: string;
  content?: string;
}

export default function ConfirmDialog(props: ConfirmDialogProps) {
  const handleConfirm = async () => {
    try {
      await props.onConfirm();
      props.onClose();
    } catch (e) {
      // Error handling is done in the parent component
    }
  };

  return (
    <Dialog open={props.open} onClose={props.onClose}>
      <DialogTitle>{props.title || 'Confirm delete'}</DialogTitle>
      <DialogContent>
        {props.content || `Are you sure you want to delete "${props.label || ''}"? This action cannot be undone.`}
      </DialogContent>
      <DialogActions>
        <Button onClick={props.onClose}>{props.cancelLabel || 'Cancel'}</Button>
        <Button variant="contained" color="error" onClick={handleConfirm}>
          {props.confirmLabel || 'Delete'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
