import { Dialog, DialogTitle, DialogContent, DialogActions, Button } from '@mui/material';

export type DeleteConfirmDialogProps = {
  open: boolean;
  title?: string;
  label?: string;
  onCancel?: () => void;
  onConfirm?: () => void;
  confirmLabel?: string;
};

export default function DeleteConfirmDialog(props: DeleteConfirmDialogProps) {
  return (
    <Dialog open={!!props.open} onClose={props.onCancel}>
      <DialogTitle>{props.title ? props.title : 'Confirm delete'}</DialogTitle>
      <DialogContent>
        Are you sure you want to delete '{props.label ? props.label : ''}'? This action cannot be undone.
      </DialogContent>
      <DialogActions>
        <Button onClick={props.onCancel}>Cancel</Button>
        <Button variant="contained" color="error" onClick={props.onConfirm}>
          {props.confirmLabel ? props.confirmLabel : 'Delete'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
