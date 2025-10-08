import React, { useState } from 'react';
import {
  Typography,
  Paper,
  Stack,
  Button,
  Alert,
  Box,
  LinearProgress,
} from '@mui/material';
import { apiClient } from '@didhub/api-client';
import NotificationSnackbar, { SnackbarMessage } from '../../components/ui/NotificationSnackbar';
import { downloadBlob } from '../../shared/utils/downloadUtils';

export default function BackupRestoreTab() {
  const [backupLoading, setBackupLoading] = useState(false);
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [snack, setSnack] = useState<SnackbarMessage>({ open: false, message: '', severity: 'success' });

  const handleCreateBackup = async () => {
    try {
      setBackupLoading(true);
      const blob = await apiClient.admin.createBackup();

      // Create download link
      downloadBlob(blob, `didhub-backup-${new Date().toISOString().split('T')[0]}.zip`);

      setSnack({
        open: true,
        message: 'Backup created and downloaded successfully',
        severity: 'success',
      });
    } catch (error) {
      setSnack({
        open: true,
        message: `Backup failed: ${String(error)}`,
        severity: 'error',
      });
    } finally {
      setBackupLoading(false);
    }
  };

  const handleRestoreBackup = async () => {
    if (!selectedFile) {
      setSnack({
        open: true,
        message: 'Please select a backup file to restore',
        severity: 'warning',
      });
      return;
    }

    try {
      setRestoreLoading(true);
      const result = await apiClient.admin.restoreBackup(selectedFile);

      if (result.success) {
        setSnack({
          open: true,
          message: result.message || 'Backup restored successfully',
          severity: 'success',
        });
        setSelectedFile(null);
        // Clear the file input
        const fileInput = document.getElementById('backup-file-input') as HTMLInputElement;
        if (fileInput) fileInput.value = '';
      } else {
        setSnack({
          open: true,
          message: result.message || 'Restore failed',
          severity: 'error',
        });
      }
    } catch (error) {
      setSnack({
        open: true,
        message: `Restore failed: ${String(error)}`,
        severity: 'error',
      });
    } finally {
      setRestoreLoading(false);
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    setSelectedFile(file);
  };

  return (
    <div>
      <Typography variant="h5" gutterBottom>
        Backup & Restore
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Create backups of your entire DIDHub instance (database and uploaded files) or restore from a previous backup.
        Backups are downloaded as ZIP files and restores require uploading the backup file.
      </Typography>

      <Stack spacing={3}>
        {/* Create Backup Section */}
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>
            Create Backup
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Download a complete backup of your DIDHub instance including the database and all uploaded files.
          </Typography>
          <Alert severity="warning" sx={{ mb: 2 }}>
            Creating a backup may take some time depending on the size of your database and uploaded files.
          </Alert>
          <Button
            variant="contained"
            color="primary"
            onClick={handleCreateBackup}
            disabled={backupLoading}
            sx={{ minWidth: 200 }}
          >
            {backupLoading ? 'Creating Backup...' : 'Create & Download Backup'}
          </Button>
          {backupLoading && (
            <Box sx={{ mt: 2 }}>
              <LinearProgress />
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Preparing backup archive...
              </Typography>
            </Box>
          )}
        </Paper>

        {/* Restore Backup Section */}
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>
            Restore Backup
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Upload and restore a DIDHub backup file. This will replace the current database and uploaded files.
          </Typography>
          <Alert severity="error" sx={{ mb: 2 }}>
            <strong>Warning:</strong> Restoring a backup will permanently replace your current data.
            Make sure you have a recent backup before proceeding.
          </Alert>
          <Stack spacing={2}>
            <input
              id="backup-file-input"
              type="file"
              accept=".zip"
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />
            <Button
              variant="outlined"
              component="label"
              htmlFor="backup-file-input"
              sx={{ alignSelf: 'flex-start' }}
            >
              Select Backup File
            </Button>
            {selectedFile && (
              <Typography variant="body2" color="text.secondary">
                Selected: {selectedFile.name} ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
              </Typography>
            )}
            <Button
              variant="contained"
              color="error"
              onClick={handleRestoreBackup}
              disabled={restoreLoading || !selectedFile}
              sx={{ minWidth: 200 }}
            >
              {restoreLoading ? 'Restoring...' : 'Restore Backup'}
            </Button>
            {restoreLoading && (
              <Box sx={{ mt: 2 }}>
                <LinearProgress />
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  Restoring from backup...
                </Typography>
              </Box>
            )}
          </Stack>
        </Paper>
      </Stack>
      <NotificationSnackbar
        open={snack.open}
        message={snack.message}
        severity={snack.severity}
        onClose={() => setSnack((prev) => ({ ...prev, open: false }))}
      />
    </div>
  );
}
