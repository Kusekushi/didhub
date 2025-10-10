import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  LinearProgress,
} from '@mui/material';
import { useAlterForm } from '../../shared/hooks/useAlterForm';
import { useAlterRelationshipOptions } from '../../shared/hooks/useAlterRelationships';
import { useUserRelationshipOptions } from '../../shared/hooks/useUserRelationships';
import AlterFormFields from './AlterForm';

export interface AlterFormDialogProps {
  mode: 'create' | 'edit';
  open: boolean;
  onClose: () => void;
  onCreated?: () => Promise<void> | void;
  onSaved?: () => Promise<void> | void;
  id?: string | number;
  routeUid?: string | number | null;
}

export { useAlterRelationshipOptions } from '../../shared/hooks/useAlterRelationships';

export default function AlterFormDialog(props: AlterFormDialogProps) {
  const { mode, open, onClose, onCreated, onSaved, id, routeUid } = props;

  const alterForm = useAlterForm(props);
  const alterRelationships = useAlterRelationshipOptions({
    partners: alterForm.values.partners,
    parents: alterForm.values.parents,
    children: alterForm.values.children,
  });
  const userRelationships = useUserRelationshipOptions();

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    // Combine partner maps from both relationship hooks
    const partnerMap = {
      ...alterRelationships.partnerMap,
      ...userRelationships.userPartnerMap,
    };
    alterForm.submit(partnerMap);
  };

  const handleClose = () => {
    if (alterForm.uploading) return; // Prevent closing while uploading
    onClose();
  };

  const title = mode === 'create' ? 'Create Alter' : 'Edit Alter';
  const submitLabel = mode === 'create' ? 'Create' : 'Save';

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="md"
      fullWidth
      disableEscapeKeyDown={alterForm.uploading}
      PaperProps={{
        component: 'form',
        onSubmit: handleSubmit,
      }}
    >
      <DialogTitle>{title}</DialogTitle>

      <DialogContent>
        {alterForm.uploading && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Uploading files...
            </Typography>
            {Object.entries(alterForm.progressMap).map(([filename, progress]) => (
              <Box key={filename} sx={{ mb: 1 }}>
                <Typography variant="caption" display="block">
                  {filename}
                </Typography>
                <LinearProgress variant="determinate" value={progress as number} />
              </Box>
            ))}
          </Box>
        )}

        <AlterFormFields
          values={alterForm.values}
          errors={alterForm.errors}
          onChange={alterForm.changeValue}
          onFile={alterForm.addFiles}
          onRemovePendingFile={alterForm.removePendingFile}
          onDeleteImage={alterForm.deleteImage}
          onReorderImages={alterForm.reorderImages}
          partnerOptions={alterRelationships.partnerOptions}
          userPartnerOptions={userRelationships.userPartnerOptions}
          uploading={alterForm.uploading}
          progressMap={alterForm.progressMap}
        />
      </DialogContent>

      <DialogActions>
        <Button onClick={handleClose} disabled={alterForm.uploading}>
          Cancel
        </Button>
        <Button type="submit" variant="contained" disabled={alterForm.uploading}>
          {submitLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
