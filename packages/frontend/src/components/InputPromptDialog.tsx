import { useState, useEffect } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField } from '@mui/material';

export type InputPromptDialogProps = {
  open: boolean;
  title?: string;
  label?: string;
  defaultValue?: string;
  onCancel?: () => void;
  onSubmit?: (value: string) => void;
};

export default function InputPromptDialog(props: InputPromptDialogProps) {
  const { open, title = '', label = '', defaultValue = '', onCancel, onSubmit } = props;
  const [value, setValue] = useState(defaultValue || '');
  useEffect(() => setValue(defaultValue || ''), [defaultValue, open]);
  return (
    <Dialog open={!!open} onClose={onCancel}>
      <DialogTitle>{title || 'Input required'}</DialogTitle>
      <DialogContent>
        <TextField fullWidth value={value} onChange={(e) => setValue(e.target.value)} label={label || ''} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>Cancel</Button>
        <Button variant="contained" onClick={() => onSubmit && onSubmit(value)}>
          OK
        </Button>
      </DialogActions>
    </Dialog>
  );
}
