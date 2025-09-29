import React from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button } from '@mui/material';

export interface SystemDeleteDialogProps {
  open: boolean;
  onClose: () => void;
  label: string;
  onConfirm: () => Promise<void>;
}

export default function SystemDeleteDialog(props: SystemDeleteDialogProps) {
  return (
    <Dialog open={props.open} onClose={props.onClose}>
      <DialogTitle>Confirm delete</DialogTitle>
      <DialogContent>Are you sure you want to delete "{props.label}"? This action cannot be undone.</DialogContent>
      <DialogActions>
        <Button onClick={props.onClose}>Cancel</Button>
        <Button
          variant="contained"
          color="error"
          onClick={async () => {
            try {
              await props.onConfirm();
              props.onClose();
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
