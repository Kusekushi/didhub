import React from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button } from '@mui/material';

interface SystemDeleteDialogProps {
  open: boolean;
  onClose: () => void;
  label: string;
  onConfirm: () => Promise<void>;
}

export default function SystemDeleteDialog({ open, onClose, label, onConfirm }: SystemDeleteDialogProps) {
  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>Confirm delete</DialogTitle>
      <DialogContent>Are you sure you want to delete "{label}"? This action cannot be undone.</DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          color="error"
          onClick={async () => {
            try {
              await onConfirm();
              onClose();
            } catch (e) {
              // Error handling is done in the parent component
            }
          }}
        >
          Delete
        </Button>
      </DialogActions>
    </Dialog>
  );
}
