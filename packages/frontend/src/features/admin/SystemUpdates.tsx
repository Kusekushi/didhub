import React, { useState, useEffect } from 'react';
import {
  Paper,
  Typography,
  Box,
  Button,
  Chip,
  Stack,
  Alert,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Table,
  TableBody,
  TableCell,
  TableRow,
} from '@mui/material';
import {
  SystemUpdate as SystemUpdateIcon,
  CheckCircle as CheckCircleIcon,
  NewReleases as NewReleasesIcon,
  Schedule as ScheduleIcon,
} from '@mui/icons-material';
import type { AlertColor } from '@mui/material';
import { apiClient, type UpdateStatus, type UpdateResult } from '@didhub/api-client';
import NotificationSnackbar from '../../components/ui/NotificationSnackbar';

export default function SystemUpdates() {
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState(false);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [snack, setSnack] = useState<{ open: boolean; text: string; severity: AlertColor }>({ open: false, text: '', severity: 'info' });

  const checkUpdates = async () => {
    setLoading(true);
    try {
      const status = await apiClient.admin.updateStatus();
      setUpdateStatus(status);
      setLastChecked(new Date());

      if (status.available) {
        setSnack({ open: true, text: `Update available: ${status.current_version} → ${status.latest_version}`, severity: 'info' });
      } else {
        setSnack({ open: true, text: 'System is up to date', severity: 'success' });
      }
    } catch (error) {
      console.error('Failed to check for updates:', error);
      setSnack({ open: true, text: 'Failed to check for updates', severity: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const performSystemUpdate = async () => {
    setConfirmDialog(false);
    setUpdating(true);
    try {
      const result: UpdateResult = await apiClient.admin.performUpdate();

      if (result.success) {
        setSnack({ open: true, text: `Update successful: ${result.message}`, severity: 'success' });
        // Refresh update status after successful update
        await checkUpdates();
      } else {
        setSnack({ open: true, text: `Update failed: ${result.message}`, severity: 'error' });
      }
    } catch (error) {
      console.error('Failed to perform update:', error);
      setSnack({ open: true, text: 'Failed to perform update', severity: 'error' });
    } finally {
      setUpdating(false);
    }
  };

  // Check for updates on component mount
  useEffect(() => {
    checkUpdates();
  }, []);

  const getStatusColor = () => {
    if (!updateStatus) return 'default';
    return updateStatus.available ? 'warning' : 'success';
  };

  const getStatusIcon = () => {
    if (loading) return <CircularProgress size={20} />;
    if (!updateStatus) return <SystemUpdateIcon />;
    return updateStatus.available ? <NewReleasesIcon /> : <CheckCircleIcon />;
  };

  const getStatusText = () => {
    if (loading) return 'Checking...';
    if (!updateStatus) return 'Unknown';
    return updateStatus.available ? 'Update Available' : 'Up to Date';
  };

  return (
    <>
      <Paper sx={{ p: 3, mb: 2 }}>
        <Typography variant="h6" gutterBottom>
          System Updates
        </Typography>

        <Stack spacing={2}>
          {updateStatus && (
            <Box>
              <Table size="small">
                <TableBody>
                  <TableRow>
                    <TableCell>
                      <strong>Current Version</strong>
                    </TableCell>
                    <TableCell>{updateStatus.current_version}</TableCell>
                  </TableRow>
                  {updateStatus.latest_version && (
                    <TableRow>
                      <TableCell>
                        <strong>Latest Version</strong>
                      </TableCell>
                      <TableCell>{updateStatus.latest_version}</TableCell>
                    </TableRow>
                  )}
                  <TableRow>
                    <TableCell>
                      <strong>Status</strong>
                    </TableCell>
                    <TableCell>
                      <Chip icon={getStatusIcon()} label={getStatusText()} color={getStatusColor()} size="small" />
                    </TableCell>
                  </TableRow>
                  {lastChecked && (
                    <TableRow>
                      <TableCell>
                        <strong>Last Checked</strong>
                      </TableCell>
                      <TableCell>
                        <Box display="flex" alignItems="center" gap={1}>
                          <ScheduleIcon fontSize="small" />
                          {lastChecked.toLocaleString()}
                        </Box>
                      </TableCell>
                    </TableRow>
                  )}
                  {updateStatus.versions && (
                    <TableRow>
                      <TableCell colSpan={2}>
                        <Typography variant="subtitle2" sx={{ mt: 2, mb: 1 }}>
                          <strong>Component Versions</strong>
                        </Typography>
                        <Box
                          sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 1 }}
                        >
                          {Object.entries(updateStatus.versions).map(([component, version]) => (
                            <Box
                              key={component}
                              sx={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                p: 1,
                                bgcolor: 'action.selected',
                                borderRadius: 1,
                              }}
                            >
                              <Typography variant="body2" sx={{ textTransform: 'capitalize' }}>
                                {component.replace('_', ' ')}:
                              </Typography>
                              <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                                {version}
                              </Typography>
                            </Box>
                          ))}
                        </Box>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </Box>
          )}

          {updateStatus?.message && (
            <Alert severity={updateStatus.available ? 'info' : 'success'} variant="outlined">
              {updateStatus.message}
            </Alert>
          )}

          <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
            <Button
              variant="outlined"
              startIcon={loading ? <CircularProgress size={16} /> : <SystemUpdateIcon />}
              onClick={checkUpdates}
              disabled={loading || updating}
            >
              Check for Updates
            </Button>

            {updateStatus?.available && (
              <Button
                variant="contained"
                color="primary"
                startIcon={updating ? <CircularProgress size={16} /> : <NewReleasesIcon />}
                onClick={() => setConfirmDialog(true)}
                disabled={updating || loading}
              >
                {updating ? 'Updating...' : 'Update Now'}
              </Button>
            )}
          </Stack>

          {updateStatus?.download_url && (
            <Typography variant="caption" color="text.secondary">
              Update will be downloaded from GitHub Releases
            </Typography>
          )}
        </Stack>
      </Paper>

      {/* Confirmation Dialog */}
      <Dialog open={confirmDialog} onClose={() => setConfirmDialog(false)}>
        <DialogTitle>Confirm System Update</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to update from version <strong>{updateStatus?.current_version}</strong> to{' '}
            <strong>{updateStatus?.latest_version}</strong>?
          </Typography>
          <Alert severity="warning" sx={{ mt: 2 }}>
            The system may need to be restarted after the update. This operation cannot be undone.
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDialog(false)}>Cancel</Button>
          <Button onClick={performSystemUpdate} variant="contained" color="primary" disabled={updating}>
            {updating ? 'Updating...' : 'Update Now'}
          </Button>
        </DialogActions>
      </Dialog>
      <NotificationSnackbar
        open={snack.open}
        message={snack.text}
        severity={snack.severity}
        onClose={() => setSnack({ ...snack, open: false })}
      />
    </>
  );
}
